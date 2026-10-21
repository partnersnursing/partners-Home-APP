import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  BarChart3,
  Search,
  Loader2,
  X,
  CalendarDays,
  UserCheck,
  Stethoscope,
} from 'lucide-react';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Notification, NotificationType } from '../components/Notification';
import { useComplianceSummary } from '../queries/compliance';

// ── Frequency filter types ──────────────────────────────────────────────────
type FrequencyFilter = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'alltime' | 'custom';

function getDateRange(filter: FrequencyFilter, customFrom?: string, customTo?: string): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  switch (filter) {
    case 'weekly': {
      const from = new Date(now);
      from.setDate(now.getDate() - 7);
      from.setHours(0, 0, 0, 0);
      return { from, to };
    }
    case 'biweekly': {
      const from = new Date(now);
      from.setDate(now.getDate() - 14);
      from.setHours(0, 0, 0, 0);
      return { from, to };
    }
    case 'monthly': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to };
    }
    case 'quarterly': {
      const q = Math.floor(now.getMonth() / 3);
      const from = new Date(now.getFullYear(), q * 3, 1);
      return { from, to };
    }
    case 'alltime': {
      const from = new Date(2000, 0, 1); // epoch-ish start
      return { from, to };
    }
    case 'custom': {
      const from = customFrom ? new Date(customFrom + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), 1);
      const cTo  = customTo   ? new Date(customTo   + 'T23:59:59') : to;
      return { from, to: cTo };
    }
  }
}

interface VisitFrequencyData {
  rnVisits: number;
  careManagerVisits: number;
  rnByPatient: Record<string, number>;
  careManagerByPatient: Record<string, number>;
}

interface ComplianceStat {
  label: string;
  value: number;
  total: number;
  status: 'good' | 'warning' | 'critical';
}

export const Compliance: React.FC = () => {
  const { profile } = useAuth();
  const userRole = profile?.role ?? '';

  const [stats, setStats] = useState<ComplianceStat[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [criticalAlerts, setCriticalAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAlertsModalOpen, setIsAlertsModalOpen] = useState(false);
  const [notification, setNotification] = useState<{ type: NotificationType, message: string } | null>(null);
  const complianceSummaryQuery = useComplianceSummary();

  // ── Visit frequency filter state ──────────────────────────────────────────
  const [freqFilter, setFreqFilter]   = useState<FrequencyFilter>('monthly');
  const [customFrom, setCustomFrom]   = useState('');
  const [customTo,   setCustomTo]     = useState('');
  const [visitData,  setVisitData]    = useState<VisitFrequencyData | null>(null);
  const [visitLoading, setVisitLoading] = useState(false);

  useEffect(() => {
    const summary = complianceSummaryQuery.data;
    setLoading(complianceSummaryQuery.isLoading || complianceSummaryQuery.isFetching);
    if (!summary) return;

    setStats(summary.stats);
    setRecentActivity(summary.recentActivity);
    setCriticalAlerts(summary.criticalAlerts);
  }, [complianceSummaryQuery.data, complianceSummaryQuery.isFetching, complianceSummaryQuery.isLoading]);

  // ── Fetch visit frequency data ─────────────────────────────────────────────
  const fetchVisitFrequency = useCallback(async () => {
    setVisitLoading(true);
    try {
      const { from, to } = getDateRange(freqFilter, customFrom || undefined, customTo || undefined);

      // Query visits within date range — all statuses (DB has 'scheduled', not 'completed')
      const { data: visitsRaw, error: visitsError } = await supabase
        .from('visits')
        .select('id, patient_id, staff_id, scheduled_at, status')
        .gte('scheduled_at', from.toISOString())
        .lte('scheduled_at', to.toISOString());

      if (visitsError) throw visitsError;

      // Fetch staff roles separately (FK hint unreliable; do manual join)
      const staffIds = [...new Set((visitsRaw || []).map((v: any) => v.staff_id).filter(Boolean))];
      let staffRoles: Record<string, string> = {};
      if (staffIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, role')
          .in('id', staffIds);
        (profilesData || []).forEach((p: any) => { staffRoles[p.id] = p.role; });
      }

      const visits = (visitsRaw || []).map((v: any) => ({ ...v, _role: staffRoles[v.staff_id] ?? '' }));
      let rnVisits = 0, careManagerVisits = 0;
      const rnByPatient: Record<string, number> = {};
      const careManagerByPatient: Record<string, number> = {};

      for (const v of visits) {
        const role = v._role;
        const pid  = v.patient_id ?? 'unknown';
        if (role === 'admin' || role === 'nurse') {
          rnVisits++;
          rnByPatient[pid] = (rnByPatient[pid] ?? 0) + 1;
        } else if (role === 'care_manager') {
          careManagerVisits++;
          careManagerByPatient[pid] = (careManagerByPatient[pid] ?? 0) + 1;
        }
      }

      setVisitData({ rnVisits, careManagerVisits, rnByPatient, careManagerByPatient });
    } catch (err) {
      console.error('[Compliance] visit frequency error', err);
      // Silently fail — don't block the rest of the page
      setVisitData(null);
    } finally {
      setVisitLoading(false);
    }
  }, [freqFilter, customFrom, customTo]);

  useEffect(() => {
    fetchVisitFrequency();
  }, [fetchVisitFrequency]);

  const fetchComplianceData = async () => {
    try {
      setLoading(true);

      const [formsRes, totalPatientsRes, logsRes] = await Promise.all([
        supabase.from('forms').select('id, name').in('name', ['GAFC Progress Note', 'GAFC Care Plan']),
        supabase
          .from('patients')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active'),
        supabase
          .from('audit_logs')
          .select('id, action, entity_type, created_at')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      const forms = formsRes.data || [];
      const progressNoteForm = forms?.find(f => f.name.includes('Progress Note'));
      const carePlanForm = forms?.find(f => f.name.includes('Care Plan'));

      const [progressNotesRes, carePlansRes] = await Promise.all([
        progressNoteForm?.id
          ? supabase
              .from('form_responses')
              .select('*', { count: 'exact', head: true })
              .eq('form_id', progressNoteForm.id)
              .eq('status', 'submitted')
          : Promise.resolve({ count: 0 }),
        carePlanForm?.id
          ? supabase
              .from('form_responses')
              .select('*', { count: 'exact', head: true })
              .eq('form_id', carePlanForm.id)
              .eq('status', 'submitted')
          : Promise.resolve({ count: 0 }),
      ]);

      const total = totalPatientsRes.count || 0;
      const progressNotesCount = progressNotesRes.count || 0;
      const carePlansCount = carePlansRes.count || 0;

      setStats([
        { 
          label: 'Care Plans (Active)', 
          value: carePlansCount,
          total: total, 
          status: total === 0 ? 'good' : carePlansCount / total > 0.9 ? 'good' : 'warning' 
        },
        { 
          label: 'Monthly Progress Notes', 
          value: progressNotesCount,
          total: total, 
          status: total === 0 ? 'good' : progressNotesCount / total > 0.8 ? 'good' : 'warning' 
        },
        { label: 'Staff Certifications', value: 0, total: 0, status: 'good' },
        { label: 'Annual Assessments', value: total, total: total, status: 'good' },
      ]);
      setRecentActivity(logsRes.data || []);

      const alerts: any[] = [];

      if (total > carePlansCount) {
        alerts.push({
          title: 'Missing Care Plan',
          patient: 'Multiple Patients',
          days: `${total - carePlansCount} patients missing care plans`
        });
      }

      if (total > progressNotesCount) {
        alerts.push({
          title: 'Missing Progress Note',
          patient: 'Multiple Patients',
          days: `${total - progressNotesCount} notes due this month`
        });
      }

      setCriticalAlerts(alerts);

    } catch (error) {
      console.error('Error fetching compliance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  const filteredActivity = recentActivity.filter(log => 
    (log.action || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.table_name || log.entity_type || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExport = () => {
    try {
      const headers = ['Metric', 'Completed', 'Total', 'Percentage'];
      const rows = stats.map(s => [
        s.label,
        s.value.toString(),
        s.total.toString(),
        `${s.total > 0 ? Math.round((s.value / s.total) * 100) : 0}%`
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(r => r.join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `Compliance_Report_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setNotification({ type: 'success', message: 'Report exported successfully!' });
    } catch (error) {
      console.error('Export error:', error);
      setNotification({ type: 'error', message: 'Failed to export report.' });
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 italic">Compliance</h1>
          <p className="text-sm md:text-base text-zinc-500">Monitor regulatory requirements and documentation status</p>
        </div>
        <Button 
          variant="secondary" 
          className="rounded-full px-6 w-full sm:w-auto"
          onClick={handleExport}
        >
          <BarChart3 className="w-4 h-4 mr-2" />
          Export Report
        </Button>
      </div>

      {/* ── Visit Frequency Filter ─────────────────────────────────────────── */}
      <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
            <CalendarDays size={18} className="text-partners-blue-dark" />
            Visit Frequency
          </h2>
          <div className="flex flex-wrap gap-2">
            {(['weekly', 'biweekly', 'monthly', 'quarterly', 'alltime', 'custom'] as FrequencyFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setFreqFilter(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${
                  freqFilter === f
                    ? 'bg-partners-blue-dark text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                {f === 'biweekly' ? 'Bi-Weekly' : f === 'alltime' ? 'All Time' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {freqFilter === 'custom' && (
          <div className="flex flex-wrap gap-3 items-center">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">From</label>
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="px-3 py-1.5 text-sm bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-partners-blue-dark/30"
            />
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">To</label>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="px-3 py-1.5 text-sm bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-partners-blue-dark/30"
            />
          </div>
        )}

        {visitLoading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400 py-2">
            <Loader2 size={16} className="animate-spin" /> Loading visit data…
          </div>
        ) : visitData ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* RN card — visible to admin/manager/nurse */}
            {['admin', 'manager', 'nurse'].includes(userRole) || !['care_manager'].includes(userRole) ? (
              <div className="p-5 bg-blue-50 rounded-2xl border border-blue-100">
                <div className="flex items-center gap-2 mb-3">
                  <Stethoscope size={18} className="text-blue-600" />
                  <p className="text-sm font-bold text-blue-900">Registered Nurse Visits</p>
                </div>
                <p className="text-3xl font-bold text-blue-700 mb-1">{visitData.rnVisits}</p>
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                  {Object.keys(visitData.rnByPatient).length} unique patients
                </p>
              </div>
            ) : null}

            {/* Care Manager card — visible to admin/manager/care_manager */}
            {['admin', 'manager', 'care_manager'].includes(userRole) || !['nurse'].includes(userRole) ? (
              <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100">
                <div className="flex items-center gap-2 mb-3">
                  <UserCheck size={18} className="text-emerald-600" />
                  <p className="text-sm font-bold text-emerald-900">Care Manager Visits</p>
                </div>
                <p className="text-3xl font-bold text-emerald-700 mb-1">{visitData.careManagerVisits}</p>
                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                  {Object.keys(visitData.careManagerByPatient).length} unique patients
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-zinc-400 py-2">No visit data available for this period.</p>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-white rounded-3xl border border-zinc-200 animate-pulse"></div>
          ))
        ) : (
          stats.map((stat) => (
            <div key={stat.label} className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div className={`p-2 rounded-xl ${
                  stat.status === 'good' ? 'bg-emerald-50 text-emerald-600' :
                  stat.status === 'warning' ? 'bg-amber-50 text-amber-600' :
                  'bg-red-50 text-red-600'
                }`}>
                  {stat.status === 'good' ? <CheckCircle2 size={20} /> :
                   stat.status === 'warning' ? <Clock size={20} /> :
                   <AlertTriangle size={20} />}
                </div>
                <span className="text-2xl font-bold text-zinc-900">
                  {stat.total > 0 ? Math.round((stat.value / stat.total) * 100) : 0}%
                </span>
              </div>
              <p className="text-sm font-medium text-zinc-500 mb-1">{stat.label}</p>
              <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${
                    stat.status === 'good' ? 'bg-emerald-500' :
                    stat.status === 'warning' ? 'bg-amber-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${stat.total > 0 ? (stat.value / stat.total) * 100 : 0}%` }}
                ></div>
              </div>
              <p className="text-[10px] text-zinc-400 mt-2 font-bold uppercase tracking-wider">
                {stat.value} of {stat.total} Completed
              </p>
            </div>
          ))
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Alerts Section */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm">
            <h3 className="text-lg font-bold text-zinc-900 mb-6 flex items-center gap-2">
              <AlertTriangle className="text-red-500" size={20} />
              Critical Alerts
            </h3>
            <div className="space-y-4">
              {criticalAlerts.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-4">No critical alerts.</p>
              ) : (
                criticalAlerts.map((alert, i) => (
                  <div key={i} className="p-4 bg-red-50/50 border border-red-100 rounded-2xl space-y-1">
                    <p className="text-sm font-bold text-red-900">{alert.title}</p>
                    <p className="text-xs text-red-700">{alert.patient || alert.staff}</p>
                    <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">{alert.days}</p>
                  </div>
                ))
              )}
            </div>
            <Button 
              variant="ghost" 
              className="w-full mt-6 text-sm text-zinc-500"
              onClick={() => setIsAlertsModalOpen(true)}
            >
              View All Alerts
            </Button>
          </div>
        </div>

        {/* Recent Activity Section */}
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <ShieldCheck className="text-partners-blue-dark" size={20} />
              Recent Compliance Activity
            </h3>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <input 
                type="text" 
                placeholder="Search logs..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-100 rounded-xl text-xs outline-none focus:ring-2 focus:ring-partners-blue-dark"
              />
            </div>
          </div>

          <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 bg-zinc-50 rounded-xl animate-pulse"></div>
              ))
            ) : filteredActivity.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-4">No compliance activity found.</p>
            ) : (
              filteredActivity.map((log, i) => (
                <div key={log.id} className="flex items-center justify-between py-2 border-b border-zinc-50 last:border-0">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-zinc-50 flex items-center justify-center text-zinc-400">
                      <FileText size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-900">{log.action}</p>
                      <p className="text-xs text-zinc-500">Table: {log.table_name || log.entity_type || 'record'} • System Log</p>
                    </div>
                  </div>
                  <span className="text-xs text-zinc-400">{formatTimeAgo(log.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Alerts Modal */}
      <Modal
        isOpen={isAlertsModalOpen}
        onClose={() => setIsAlertsModalOpen(false)}
        title="Compliance Alerts"
        size="lg"
      >
        <div className="space-y-6">
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-3">
            <AlertTriangle className="text-amber-600 shrink-0" size={20} />
            <p className="text-sm text-amber-800">
              The following items require immediate attention to maintain regulatory compliance.
            </p>
          </div>

          <div className="space-y-4">
            {criticalAlerts.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                <CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={32} />
                <p>No critical alerts found. All systems are compliant.</p>
              </div>
            ) : (
              criticalAlerts.map((alert, i) => (
                <div key={i} className="flex items-center justify-between p-6 bg-white rounded-3xl border border-zinc-200 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-600">
                      <AlertTriangle size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-zinc-900">{alert.title}</h4>
                      <p className="text-sm text-zinc-500">{alert.patient || alert.staff}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-[10px] font-bold uppercase tracking-wider">
                      Critical
                    </span>
                    <p className="text-xs text-zinc-400 mt-1">{alert.days}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex justify-end pt-4 border-t border-zinc-100">
            <Button onClick={() => setIsAlertsModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {notification && (
        <Notification 
          type={notification.type} 
          message={notification.message} 
          onClose={() => setNotification(null)} 
        />
      )}
    </div>
  );
};
