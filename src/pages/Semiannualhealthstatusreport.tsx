import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { FileText, Send, ArrowLeft } from 'lucide-react';
import { supabase, getFormIdByName, withTimeout } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Notification, NotificationType } from '../components/Notification';
import { PrintPreviewModal } from '../components/PrintPreviewModal';
import { SemiAnnualHealthStatusReportTemplate } from '../components/PDFTemplates/Semiannualhealthstatusreporttemplate';
import { Logo } from '../components/Logo';

const FORM_NAME = 'Semi-Annual Health Status Report';

interface FormData {
  authFrom: string;
  authTo: string;
  clientName: string;
  dob: string;
  clientAddress: string;
  clientPCP: string;
  clientDiagnoses: string;
  significantFindings: string;
  mentalStatus: string;
  continence: string;
  adaptiveEquipment: string;
  clientHasPhone: string;
  physicalAssistanceADL: string;
  rnSignature: string;
  rnSignatureDate: string;
  medicationChanges: string;
  conditionChanges: string;
  mostRecentPhysicalExam: string;
  mdSignature: string;
  mdSignatureDate: string;
}

const initialFormData: FormData = {
  authFrom: '',
  authTo: '',
  clientName: '',
  dob: '',
  clientAddress: '',
  clientPCP: '',
  clientDiagnoses: '',
  significantFindings: '',
  mentalStatus: '',
  continence: '',
  adaptiveEquipment: '',
  clientHasPhone: '',
  physicalAssistanceADL: '',
  rnSignature: '',
  rnSignatureDate: new Date().toISOString().split('T')[0],
  medicationChanges: '',
  conditionChanges: '',
  mostRecentPhysicalExam: '',
  mdSignature: '',
  mdSignatureDate: '',
};

export const SemiAnnualHealthStatusReport: React.FC = () => {
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
      .select('id, first_name, last_name, dob, phone, street, apt, city, state, zip, pcp:pcp_id(first_name, last_name)')
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

  const update = (field: keyof FormData, value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const handlePatientChange = (id: string) => {
    setSelectedPatient(id);
    if (id) {
      const p = patients.find(pt => pt.id === id);
      if (p) {
        const addressParts = [p.street, p.apt].filter(Boolean).join(' ');
        const pcpName = p.pcp ? `${p.pcp.first_name} ${p.pcp.last_name}` : '';
        setFormData(prev => ({
          ...prev,
          clientName: `${p.first_name} ${p.last_name}`,
          dob: p.dob ?? prev.dob,
          clientAddress: [addressParts, p.city, p.state, p.zip].filter(Boolean).join(', ') || prev.clientAddress,
          clientPCP: pcpName || prev.clientPCP,
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
              Semi-Annual Health Status Report
            </h2>
            <p className="text-sm text-partners-gray">Group Adult Foster Care Program (GAFC)</p>
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
        template={SemiAnnualHealthStatusReportTemplate}
        data={formData}
        title={FORM_NAME}
        filename={`Semi_Annual_Health_Status_${formData.clientName?.replace(/\s+/g, '_') || 'Report'}.pdf`}
      />

      {/* Form body */}
      <div className="space-y-8 bg-white p-4 sm:p-8 rounded-2xl border border-zinc-200 shadow-sm">

        {/* Authorization & Patient */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2">Authorization & Patient Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className={labelClass}>Authorization From</label><input type="date" value={formData.authFrom} onChange={e => update('authFrom', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Authorization To</label><input type="date" value={formData.authTo} onChange={e => update('authTo', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Client Name</label><input type="text" value={formData.clientName} onChange={e => update('clientName', e.target.value)} className={inputClass} placeholder="Full name" /></div>
            <div><label className={labelClass}>Date of Birth</label><input type="date" value={formData.dob} onChange={e => update('dob', e.target.value)} className={inputClass} /></div>
            <div className="md:col-span-2"><label className={labelClass}>Client Address</label><input type="text" value={formData.clientAddress} onChange={e => update('clientAddress', e.target.value)} className={inputClass} placeholder="Street, City, State, ZIP" /></div>
            <div className="md:col-span-2"><label className={labelClass}>Client PCP</label><input type="text" value={formData.clientPCP} onChange={e => update('clientPCP', e.target.value)} className={inputClass} placeholder="Primary Care Provider name" /></div>
            <div className="md:col-span-2"><label className={labelClass}>Client Diagnoses</label><textarea rows={3} value={formData.clientDiagnoses} onChange={e => update('clientDiagnoses', e.target.value)} className={inputClass} placeholder="List diagnoses..." /></div>
          </div>
        </section>

        {/* Nursing Review */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2">Nursing Review</h3>
          <div className="p-3 bg-zinc-50 rounded-xl text-sm text-zinc-600 border border-zinc-100">
            Client Medications / Client Care Plan: <span className="text-zinc-400 italic">see attached for PCP review</span>
          </div>
          <div><label className={labelClass}>Significant Findings or Changes</label><textarea rows={4} value={formData.significantFindings} onChange={e => update('significantFindings', e.target.value)} className={inputClass} placeholder="Document any significant findings or changes..." /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className={labelClass}>Mental Status</label><input type="text" value={formData.mentalStatus} onChange={e => update('mentalStatus', e.target.value)} className={inputClass} placeholder="e.g., Alert & Oriented x3" /></div>
            <div><label className={labelClass}>Continence</label><input type="text" value={formData.continence} onChange={e => update('continence', e.target.value)} className={inputClass} placeholder="e.g., Continent, Incontinent" /></div>
            <div><label className={labelClass}>Adaptive Equipment</label><input type="text" value={formData.adaptiveEquipment} onChange={e => update('adaptiveEquipment', e.target.value)} className={inputClass} placeholder="e.g., Cane, Walker, Wheelchair" /></div>
            <div>
              <label className={labelClass}>Client Has Phone</label>
              <select value={formData.clientHasPhone} onChange={e => update('clientHasPhone', e.target.value)} className={inputClass}>
                <option value="">Select...</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>
          </div>
          <div><label className={labelClass}>Physical Assistance or Cueing/Supervision to complete at least 1 ADL (specify)</label><textarea rows={3} value={formData.physicalAssistanceADL} onChange={e => update('physicalAssistanceADL', e.target.value)} className={inputClass} placeholder="Specify ADL assistance required..." /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className={labelClass}>RN Signature</label><input type="text" value={formData.rnSignature} onChange={e => update('rnSignature', e.target.value)} className={inputClass} placeholder="Registered Nurse name" /></div>
            <div><label className={labelClass}>Date</label><input type="date" value={formData.rnSignatureDate} onChange={e => update('rnSignatureDate', e.target.value)} className={inputClass} /></div>
          </div>
        </section>

        {/* PCP Review */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2">PCP Review</h3>
          <div><label className={labelClass}>I have read the attached medication list. Changes are as follows</label><textarea rows={3} value={formData.medicationChanges} onChange={e => update('medicationChanges', e.target.value)} className={inputClass} placeholder="Document medication list changes..." /></div>
          <div><label className={labelClass}>Significant changes in the client's condition are as follows</label><textarea rows={3} value={formData.conditionChanges} onChange={e => update('conditionChanges', e.target.value)} className={inputClass} placeholder="Document significant condition changes..." /></div>
          <div><label className={labelClass}>Date of Most Recent Physical Exam</label><input type="date" value={formData.mostRecentPhysicalExam} onChange={e => update('mostRecentPhysicalExam', e.target.value)} className="w-full md:w-1/2 px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none text-sm" /></div>
          <div className="p-3 bg-zinc-50 rounded-xl text-sm text-zinc-600 border border-zinc-100">
            I certify that this patient is under my care and that the Group Adult Foster Care Program is appropriate to meet the physical and psychosocial needs of the patient. I approve GAFC program for the dates indicated above.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className={labelClass}>MD Signature</label><input type="text" value={formData.mdSignature} onChange={e => update('mdSignature', e.target.value)} className={inputClass} placeholder="Physician name" /></div>
            <div><label className={labelClass}>Date</label><input type="date" value={formData.mdSignatureDate} onChange={e => update('mdSignatureDate', e.target.value)} className={inputClass} /></div>
          </div>
          <p className="text-xs text-zinc-400">Return to: Partners Home and Nursing Services · 208 Main St. #112 Milford MA 01757 · Fax: 508-484-6265</p>
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
