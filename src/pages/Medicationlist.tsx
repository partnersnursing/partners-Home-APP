import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { FileText, Send, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { supabase, getFormIdByName, withTimeout } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Notification, NotificationType } from '../components/Notification';
import { PrintPreviewModal } from '../components/PrintPreviewModal';
import { MedicationListTemplate } from '../components/PDFTemplates/Medicationlisttemplate';
import { Logo } from '../components/Logo';

const FORM_NAME = 'Medication List';

interface MedicationRow {
  id: string;
  medication: string;
  dose: string;
  number: string;
  route: string;
  frequency: string;
  startDate: string;
  stopDate: string;
}

interface FormData {
  clientName: string;
  pcpName: string;
  pcpNumber: string;
  medications: MedicationRow[];
  reviewedInitialsDate: string;
}

const blankMed = (): MedicationRow => ({
  id: crypto.randomUUID(),
  medication: '', dose: '', number: '', route: '', frequency: '', startDate: '', stopDate: '',
});

const ROUTES = ['PO (Oral)', 'SL (Sublingual)', 'Top (Topical)', 'INH (Inhaled)', 'INJ (Injection)', 'Trans (Transdermal)', 'Optic', 'Otic', 'Nasal', 'Rectal', 'Other'];

const initialFormData: FormData = {
  clientName: '',
  pcpName: '',
  pcpNumber: '',
  medications: [blankMed()],
  reviewedInitialsDate: '',
};

export const MedicationList: React.FC = () => {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();

  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [notification, setNotification] = useState<{ type: NotificationType; message: string } | null>(null);
  const [formId, setFormId] = useState<string | null>(null);

  const editId = searchParams.get('id');

  useEffect(() => {
    fetchPatients();
    fetchFormId();
    if (editId) loadExisting(editId);
  }, [editId]);

  const fetchPatients = async () => {
    const { data } = await supabase.from('patients').select('id, first_name, last_name, pcp:pcp_id(first_name, last_name, phone)').order('last_name', { ascending: true });
    setPatients(data || []);
  };

  const fetchFormId = async () => {
    const id = await getFormIdByName(FORM_NAME);
    setFormId(id);
  };

  const loadExisting = async (id: string) => {
    const { data } = await supabase.from('form_responses').select('*').eq('id', id).single();
    if (data) {
      setSelectedPatient(data.patient_id || '');
      setFormData({ ...initialFormData, ...data.data });
    }
  };

  const update = (field: keyof Omit<FormData, 'medications'>, value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const updateMed = (id: string, field: keyof MedicationRow, value: string) =>
    setFormData(prev => ({ ...prev, medications: prev.medications.map(m => m.id === id ? { ...m, [field]: value } : m) }));

  const addMed = () =>
    setFormData(prev => ({ ...prev, medications: [...prev.medications, blankMed()] }));

  const removeMed = (id: string) =>
    setFormData(prev => ({ ...prev, medications: prev.medications.filter(m => m.id !== id) }));

  const handlePatientChange = (id: string) => {
    setSelectedPatient(id);
    if (id) {
      const patient = patients.find(p => p.id === id);
      if (patient) {
        setFormData(prev => ({
          ...prev,
          clientName: `${patient.first_name} ${patient.last_name}`,
          pcpName: patient.pcp ? `${patient.pcp.first_name} ${patient.pcp.last_name}` : prev.pcpName,
          pcpNumber: patient.pcp?.phone ?? prev.pcpNumber,
        }));
      }
    }
  };

  const handleSubmit = async () => {
    if (!profile) {
      setNotification({ type: 'error', message: 'You must be logged in to submit.' });
      return;
    }
    setIsSubmitting(true);
    try {
      let currentFormId = formId;
      if (!currentFormId) {
        currentFormId = await withTimeout(getFormIdByName(FORM_NAME)) as any;
        if (!currentFormId) throw new Error(`"${FORM_NAME}" not found in database. Please run Database Setup from the Dashboard.`);
        setFormId(currentFormId);
      }

      if (editId) {
        const { error } = await supabase
          .from('form_responses')
          .update({ data: formData, status: 'submitted', updated_at: new Date().toISOString() })
          .eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('form_responses')
          .insert([{ form_id: currentFormId, patient_id: selectedPatient || null, staff_id: profile.id, data: formData, status: 'submitted' }]);
        if (error) throw error;
      }

      setNotification({ type: 'success', message: editId ? 'Form updated successfully!' : 'Form submitted successfully!' });
    } catch (err: any) {
      setNotification({ type: 'error', message: `Error: ${err.message || 'Please try again.'}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = 'w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none text-sm transition-all';
  const labelClass = 'block text-sm font-medium text-zinc-700 mb-1';
  const cellInput = 'w-full px-2 py-1.5 rounded-lg border border-zinc-200 focus:ring-1 focus:ring-partners-blue-dark outline-none text-xs bg-white transition-all';

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">

      <Link to="/clinical-forms" className="flex items-center gap-2 text-zinc-500 hover:text-partners-blue-dark transition-colors group no-print">
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-sm font-medium">Back to Forms</span>
      </Link>

      {/* Header + actions */}
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Logo showText size={48} />
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-partners-blue-dark flex items-center gap-2">
              <FileText className="text-partners-green shrink-0" />
              Client Medication List
            </h2>
            <p className="text-sm text-partners-gray">Partners Home and Nursing Services</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full md:justify-end no-print">
          <div className="w-full sm:w-64">
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1 ml-1">Select Patient</label>
            <select
              value={selectedPatient}
              onChange={e => handlePatientChange(e.target.value)}
              className="w-full h-10 px-4 rounded-xl border border-zinc-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-partners-blue-dark transition-all appearance-none cursor-pointer shadow-sm"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1.25rem' }}
            >
              <option value="">-- Choose a Patient --</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>)}
            </select>
          </div>

          <div className="flex flex-row items-center justify-end gap-3 w-full sm:w-auto mt-auto">
            <Button variant="secondary" type="button" onClick={() => setIsPreviewOpen(true)} className="h-10 px-4 rounded-xl shadow-sm">
              <FileText className="w-4 h-4 mr-2" />Preview & Print
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting} className="h-10 px-4 rounded-xl shadow-md bg-partners-blue-dark hover:bg-partners-blue transition-all active:scale-95">
              <Send className="w-4 h-4 mr-2" />{isSubmitting ? 'Submitting...' : 'Submit Form'}
            </Button>
          </div>
        </div>
      </div>

      <PrintPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        template={MedicationListTemplate}
        data={formData}
        title={FORM_NAME}
        filename={`Medication_List_${formData.clientName?.replace(/\s+/g, '_') || 'Client'}.pdf`}
      />

      {/* Form body */}
      <div className="space-y-8 bg-white p-4 sm:p-8 rounded-2xl border border-zinc-200 shadow-sm">

        {/* Client Info */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2">Client Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className={labelClass}>Client Name</label><input type="text" value={formData.clientName} onChange={e => update('clientName', e.target.value)} className={inputClass} placeholder="Full name" /></div>
            <div><label className={labelClass}>PCP Name</label><input type="text" value={formData.pcpName} onChange={e => update('pcpName', e.target.value)} className={inputClass} placeholder="Primary Care Provider" /></div>
            <div><label className={labelClass}>PCP Phone Number</label><input type="tel" value={formData.pcpNumber} onChange={e => update('pcpNumber', e.target.value)} className={inputClass} placeholder="(xxx) xxx-xxxx" /></div>
          </div>
        </section>

        {/* Medications */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-zinc-900 border-b pb-2 flex-1">Medications</h3>
            <button onClick={addMed} className="flex items-center gap-2 px-4 py-2 bg-partners-blue-dark text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity ml-4">
              <Plus size={16} /> Add Medication
            </button>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  {['Medication', 'Dose', 'Number', 'Route', 'Frequency', 'Start Date', 'Stop Date', ''].map(h => (
                    <th key={h} className="px-3 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {formData.medications.map((med) => (
                  <tr key={med.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-3 py-2 min-w-[160px]"><input type="text" value={med.medication} onChange={e => updateMed(med.id, 'medication', e.target.value)} className={cellInput} placeholder="Drug name" /></td>
                    <td className="px-3 py-2 min-w-[80px]"><input type="text" value={med.dose} onChange={e => updateMed(med.id, 'dose', e.target.value)} className={cellInput} placeholder="10mg" /></td>
                    <td className="px-3 py-2 min-w-[70px]"><input type="text" value={med.number} onChange={e => updateMed(med.id, 'number', e.target.value)} className={cellInput} placeholder="#30" /></td>
                    <td className="px-3 py-2 min-w-[120px]">
                      <select value={med.route} onChange={e => updateMed(med.id, 'route', e.target.value)} className={cellInput}>
                        <option value="">Select...</option>
                        {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 min-w-[130px]"><input type="text" value={med.frequency} onChange={e => updateMed(med.id, 'frequency', e.target.value)} className={cellInput} placeholder="BID, QD" /></td>
                    <td className="px-3 py-2 min-w-[120px]"><input type="date" value={med.startDate} onChange={e => updateMed(med.id, 'startDate', e.target.value)} className={cellInput} /></td>
                    <td className="px-3 py-2 min-w-[120px]"><input type="date" value={med.stopDate} onChange={e => updateMed(med.id, 'stopDate', e.target.value)} className={cellInput} /></td>
                    <td className="px-3 py-2">
                      {formData.medications.length > 1 && (
                        <button onClick={() => removeMed(med.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-4">
            {formData.medications.map((med, idx) => (
              <div key={med.id} className="border border-zinc-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-500 uppercase">Medication #{idx + 1}</span>
                  {formData.medications.length > 1 && (
                    <button onClick={() => removeMed(med.id)} className="p-1.5 text-red-400 hover:text-red-600 rounded-lg"><Trash2 size={14} /></button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Medication</label><input type="text" value={med.medication} onChange={e => updateMed(med.id, 'medication', e.target.value)} className={inputClass} /></div>
                  <div><label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Dose</label><input type="text" value={med.dose} onChange={e => updateMed(med.id, 'dose', e.target.value)} className={inputClass} /></div>
                  <div><label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Number</label><input type="text" value={med.number} onChange={e => updateMed(med.id, 'number', e.target.value)} className={inputClass} /></div>
                  <div><label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Route</label>
                    <select value={med.route} onChange={e => updateMed(med.id, 'route', e.target.value)} className={inputClass}>
                      <option value="">Select...</option>
                      {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div><label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Frequency</label><input type="text" value={med.frequency} onChange={e => updateMed(med.id, 'frequency', e.target.value)} className={inputClass} /></div>
                  <div><label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Start Date</label><input type="date" value={med.startDate} onChange={e => updateMed(med.id, 'startDate', e.target.value)} className={inputClass} /></div>
                  <div><label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Stop Date</label><input type="date" value={med.stopDate} onChange={e => updateMed(med.id, 'stopDate', e.target.value)} className={inputClass} /></div>
                </div>
              </div>
            ))}
          </div>

          {/* Reviewed row */}
          <div className="pt-4 border-t border-zinc-100">
            <label className={labelClass}>Reviewed with Client every visit (initials / date)</label>
            <input type="text" value={formData.reviewedInitialsDate} onChange={e => update('reviewedInitialsDate', e.target.value)} className="w-full md:w-1/2 px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none text-sm" placeholder="e.g. J.S. 03/28/2026" />
          </div>
        </section>

        <div className="flex flex-row items-center justify-end gap-3 no-print pt-4 border-t border-zinc-100">
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting} className="h-10 px-4 rounded-xl shadow-md bg-partners-blue-dark hover:bg-partners-blue transition-all active:scale-95">
            <Send className="w-4 h-4 mr-2" />{isSubmitting ? 'Submitting...' : 'Submit Form'}
          </Button>
        </div>
      </div>

      {notification && <Notification type={notification.type} message={notification.message} onClose={() => setNotification(null)} />}
    </div>
  );
};
