import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { FileText, Send, ArrowLeft } from 'lucide-react';
import { supabase, getFormIdByName, withTimeout } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Notification, NotificationType } from '../components/Notification';
import { PrintPreviewModal } from '../components/PrintPreviewModal';
import { GAFCAideCarePlanTemplate } from '../components/PDFTemplates/Gafcaidecareplantemplate';
import { Logo } from '../components/Logo';

const FORM_NAME = 'GAFC Aide Care Plan';

type CheckEntry = { cue: boolean; assist: boolean; frequency: string };
const blankCheck = (): CheckEntry => ({ cue: false, assist: false, frequency: '' });

interface FormData {
  name: string; dob: string; address: string; city: string;
  homePhone: string; cellPhone: string; alerts: string; diagnoses: string;
  dentures: boolean; glasses: boolean; hearingAids: boolean; cane: boolean;
  walker: boolean; wheelchair: boolean; tubChair: boolean;
  goals: string;
  mealPrep: boolean; groceryShopping: boolean; laundry: boolean;
  lightHousekeeping: boolean; lightHousekeepingNote: string;
  safeSmokingReminder: boolean; medicationReminder: boolean; programReminder: boolean;
  informalSocialization: boolean; askIfOKDaily: boolean;
  bathing: { tub: CheckEntry; shower: CheckEntry; partial: CheckEntry; shampoo: CheckEntry; footCare: CheckEntry };
  dressing: { upper: CheckEntry; lower: CheckEntry; shoeSocks: CheckEntry };
  grooming: { hairCare: CheckEntry; skinCare: CheckEntry; nailCare: CheckEntry; oralCare: CheckEntry; shave: CheckEntry; makeup: CheckEntry };
  ambulation: { rangeOfMotion: CheckEntry; walk: CheckEntry; exercise: CheckEntry };
  toileting: { bathroom: CheckEntry; commode: CheckEntry; bedpan: CheckEntry };
  transfers: { toFromBed: CheckEntry; toFromChair: CheckEntry; toFromWC: CheckEntry; toFromStand: CheckEntry };
  completedBy: string; completedDate: string;
}

const initialFormData: FormData = {
  name: '', dob: '', address: '', city: '', homePhone: '', cellPhone: '', alerts: '', diagnoses: '',
  dentures: false, glasses: false, hearingAids: false, cane: false, walker: false, wheelchair: false, tubChair: false,
  goals: '',
  mealPrep: true, groceryShopping: true, laundry: true, lightHousekeeping: true, lightHousekeepingNote: '',
  safeSmokingReminder: false, medicationReminder: false, programReminder: false,
  informalSocialization: false, askIfOKDaily: false,
  bathing: { tub: blankCheck(), shower: blankCheck(), partial: blankCheck(), shampoo: blankCheck(), footCare: blankCheck() },
  dressing: { upper: blankCheck(), lower: blankCheck(), shoeSocks: blankCheck() },
  grooming: { hairCare: blankCheck(), skinCare: blankCheck(), nailCare: blankCheck(), oralCare: blankCheck(), shave: blankCheck(), makeup: blankCheck() },
  ambulation: { rangeOfMotion: blankCheck(), walk: blankCheck(), exercise: blankCheck() },
  toileting: { bathroom: blankCheck(), commode: blankCheck(), bedpan: blankCheck() },
  transfers: { toFromBed: blankCheck(), toFromChair: blankCheck(), toFromWC: blankCheck(), toFromStand: blankCheck() },
  completedBy: '', completedDate: new Date().toISOString().split('T')[0],
};

const ActivityRow: React.FC<{ label: string; value: CheckEntry; onChange: (v: CheckEntry) => void }> = ({ label, value, onChange }) => (
  <tr className="border-b border-zinc-100 hover:bg-zinc-50/50">
    <td className="py-2 pl-4 text-sm text-zinc-700 capitalize">
      {label.replace(/([A-Z])/g, ' $1').replace('to From', 'to/from ').replace('Shoe Socks', 'Shoe/Socks').trim()}
    </td>
    <td className="py-2 text-center"><input type="checkbox" checked={value.cue} onChange={e => onChange({ ...value, cue: e.target.checked })} className="w-4 h-4 accent-partners-blue-dark" /></td>
    <td className="py-2 text-center"><input type="checkbox" checked={value.assist} onChange={e => onChange({ ...value, assist: e.target.checked })} className="w-4 h-4 accent-partners-blue-dark" /></td>
    <td className="py-2 pr-4"><input type="text" value={value.frequency} onChange={e => onChange({ ...value, frequency: e.target.value })} placeholder="e.g. Daily, 3x/week" className="w-full px-2 py-1 text-xs rounded-lg border border-zinc-200 focus:ring-1 focus:ring-partners-blue-dark outline-none" /></td>
  </tr>
);

const ActivitySection: React.FC<{ title: string; section: Record<string, CheckEntry>; onChange: (k: string, v: CheckEntry) => void }> = ({ title, section, onChange }) => (
  <table className="w-full text-left rounded-xl overflow-hidden border border-zinc-200 mb-4">
    <thead>
      <tr className="bg-zinc-50">
        <th className="py-2 pl-4 text-xs font-bold text-zinc-700 uppercase tracking-wide w-1/3">{title}</th>
        <th className="py-2 text-center text-xs font-bold text-zinc-500 uppercase tracking-wide w-16">Cue/Supv.</th>
        <th className="py-2 text-center text-xs font-bold text-zinc-500 uppercase tracking-wide w-16">Assist</th>
        <th className="py-2 pr-4 text-xs font-bold text-zinc-500 uppercase tracking-wide">Frequency</th>
      </tr>
    </thead>
    <tbody>
      {Object.entries(section).map(([key, val]) => (
        <ActivityRow key={key} label={key} value={val} onChange={v => onChange(key, v)} />
      ))}
    </tbody>
  </table>
);

export const GAFCAideCarePlan: React.FC = () => {
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
    const { data } = await supabase
      .from('patients')
      .select('id, first_name, last_name, dob, phone, street, apt, city, state, zip')
      .order('last_name', { ascending: true });
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

  const update = (field: keyof FormData, value: any) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const updateActivity = (section: keyof FormData, key: string, val: CheckEntry) =>
    setFormData(prev => ({ ...prev, [section]: { ...(prev[section] as any), [key]: val } }));

  const handlePatientChange = (id: string) => {
    setSelectedPatient(id);
    if (id) {
      const p = patients.find(pt => pt.id === id);
      if (p) {
        const addressParts = [p.street, p.apt].filter(Boolean).join(' ');
        setFormData(prev => ({
          ...prev,
          name: `${p.first_name} ${p.last_name}`,
          dob: p.dob ?? prev.dob,
          address: addressParts || prev.address,
          city: [p.city, p.state, p.zip].filter(Boolean).join(', ') || prev.city,
          homePhone: p.phone ?? prev.homePhone,
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
  const checkLabel = 'flex items-center gap-2 text-sm text-zinc-700 cursor-pointer';

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">

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
              GAFC Aide Care Plan
            </h2>
            <p className="text-sm text-partners-gray">Group Adult Foster Care — Home Health Aide Care Plan</p>
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
        template={GAFCAideCarePlanTemplate}
        data={formData}
        title={FORM_NAME}
        filename={`GAFC_Aide_Care_Plan_${formData.name?.replace(/\s+/g, '_') || 'Plan'}.pdf`}
      />

      {/* Form body */}
      <div className="space-y-8 bg-white p-4 sm:p-8 rounded-2xl border border-zinc-200 shadow-sm">

        {/* Demographics */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2">Client Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className={labelClass}>Name</label><input type="text" value={formData.name} onChange={e => update('name', e.target.value)} className={inputClass} placeholder="Client full name" /></div>
            <div><label className={labelClass}>Date of Birth</label><input type="date" value={formData.dob} onChange={e => update('dob', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Address</label><input type="text" value={formData.address} onChange={e => update('address', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>City</label><input type="text" value={formData.city} onChange={e => update('city', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Home Phone</label><input type="tel" value={formData.homePhone} onChange={e => update('homePhone', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Cell Phone</label><input type="tel" value={formData.cellPhone} onChange={e => update('cellPhone', e.target.value)} className={inputClass} /></div>
            <div className="md:col-span-2"><label className={labelClass}>Alerts</label><input type="text" value={formData.alerts} onChange={e => update('alerts', e.target.value)} className={inputClass} placeholder="Any critical alerts..." /></div>
          </div>
        </section>

        {/* Diagnoses + Equipment */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2">Diagnoses & Equipment</h3>
          <div><label className={labelClass}>Diagnoses</label><textarea rows={3} value={formData.diagnoses} onChange={e => update('diagnoses', e.target.value)} className={inputClass} placeholder="List all diagnoses..." /></div>
          <div>
            <label className={labelClass}>Equipment</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
              {([['dentures','Dentures'],['glasses','Glasses'],['hearingAids','Hearing Aids'],['cane','Cane'],['walker','Walker'],['wheelchair','Wheelchair'],['tubChair','Tub Chair']] as [keyof FormData, string][]).map(([key, label]) => (
                <label key={key as string} className={checkLabel}>
                  <input type="checkbox" checked={formData[key] as boolean} onChange={e => update(key, e.target.checked)} className="w-4 h-4 accent-partners-blue-dark" />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* Goals */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2">Goals</h3>
          <div className="p-3 bg-zinc-50 rounded-xl text-sm text-zinc-600 border border-zinc-100">
            <span className="italic text-zinc-400">{formData.name || '[Client name]'}</span> will have their personal care needs met by the GAFC Program.
          </div>
          <div><label className={labelClass}>Additional Goals</label><textarea rows={2} value={formData.goals} onChange={e => update('goals', e.target.value)} className={inputClass} placeholder="Document any additional goals..." /></div>
        </section>

        {/* Services */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2">Services & Reminders</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Home Help (as needed)</p>
              <div className="space-y-2">
                {([['mealPrep','Meal Preparation'],['groceryShopping','Grocery Shopping'],['laundry','Laundry']] as [keyof FormData, string][]).map(([key, label]) => (
                  <label key={key as string} className={checkLabel}><input type="checkbox" checked={formData[key] as boolean} onChange={e => update(key, e.target.checked)} className="w-4 h-4 accent-partners-blue-dark" />{label} <span className="text-xs text-zinc-400">per request</span></label>
                ))}
                <label className={checkLabel}><input type="checkbox" checked={formData.lightHousekeeping} onChange={e => update('lightHousekeeping', e.target.checked)} className="w-4 h-4 accent-partners-blue-dark" />Light Housekeeping</label>
                {formData.lightHousekeeping && <input type="text" value={formData.lightHousekeepingNote} onChange={e => update('lightHousekeepingNote', e.target.value)} placeholder="Specify..." className="w-full px-2 py-1 text-xs rounded-lg border border-zinc-200 focus:ring-1 focus:ring-partners-blue-dark outline-none mt-1" />}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Reminders (as needed)</p>
              <div className="space-y-2">
                <label className={checkLabel}><input type="checkbox" checked={formData.safeSmokingReminder} onChange={e => update('safeSmokingReminder', e.target.checked)} className="w-4 h-4 accent-partners-blue-dark" />Safe Smoking Reminder <span className="text-xs text-zinc-400">daily</span></label>
                <label className={checkLabel}><input type="checkbox" checked={formData.medicationReminder} onChange={e => update('medicationReminder', e.target.checked)} className="w-4 h-4 accent-partners-blue-dark" />Medication Reminder <span className="text-xs text-zinc-400">daily</span></label>
                <label className={checkLabel}><input type="checkbox" checked={formData.programReminder} onChange={e => update('programReminder', e.target.checked)} className="w-4 h-4 accent-partners-blue-dark" />Program Reminder</label>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Other (during personal care)</p>
              <div className="space-y-2">
                <label className={checkLabel}><input type="checkbox" checked={formData.informalSocialization} onChange={e => update('informalSocialization', e.target.checked)} className="w-4 h-4 accent-partners-blue-dark" />Informal Socialization</label>
                <label className={checkLabel}><input type="checkbox" checked={formData.askIfOKDaily} onChange={e => update('askIfOKDaily', e.target.checked)} className="w-4 h-4 accent-partners-blue-dark" />Ask if "OK" daily</label>
              </div>
            </div>
          </div>
        </section>

        {/* ADL Activity Tables */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2">Activities of Daily Living</h3>
          <p className="text-xs text-zinc-400">Cue/Supervise = cueing/supervision to complete entire task &nbsp;|&nbsp; Assist = physical assistance &nbsp;|&nbsp; Personal Care 7×/week</p>
          <ActivitySection title="Bathing" section={formData.bathing} onChange={(k, v) => updateActivity('bathing', k, v)} />
          <ActivitySection title="(Un)/Dressing" section={formData.dressing} onChange={(k, v) => updateActivity('dressing', k, v)} />
          <ActivitySection title="Grooming" section={formData.grooming} onChange={(k, v) => updateActivity('grooming', k, v)} />
          <ActivitySection title="Ambulation" section={formData.ambulation} onChange={(k, v) => updateActivity('ambulation', k, v)} />
          <ActivitySection title="Toileting" section={formData.toileting} onChange={(k, v) => updateActivity('toileting', k, v)} />
          <ActivitySection title="Transfers" section={formData.transfers} onChange={(k, v) => updateActivity('transfers', k, v)} />
        </section>

        {/* Completion */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2">Completion</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className={labelClass}>Completed By</label><input type="text" value={formData.completedBy} onChange={e => update('completedBy', e.target.value)} className={inputClass} placeholder="Name and title" /></div>
            <div><label className={labelClass}>Date</label><input type="date" value={formData.completedDate} onChange={e => update('completedDate', e.target.value)} className={inputClass} /></div>
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
