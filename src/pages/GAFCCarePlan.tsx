import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams, Link } from 'react-router-dom';
import * as z from 'zod';
import { Button } from '../components/Button';
import { ClipboardList, Plus, Trash2, Send, ArrowLeft, Loader2, FileText } from 'lucide-react';
import { SignaturePad } from '../components/SignaturePad';
import { Notification, NotificationType } from '../components/Notification';
import { Logo } from '../components/Logo';
import { supabase, getFormIdByName, withTimeout } from '../services/supabase';
import { generateFormPDF } from '../services/pdfService';
import { PrintPreviewModal } from '../components/PrintPreviewModal';
import { GAFCCarePlanTemplate } from '../components/PDFTemplates/GAFCCarePlanTemplate';
import { useAuth } from '../context/AuthContext';

const adlLevels = ['Independent', 'Supervision', 'Partial Assist', 'Full Assist'] as const;
const iadlLevels = ['Independent', 'Needs Assistance'] as const;

const FORM_NAME = 'GAFC Care Plan';

const carePlanSchema = z.object({
  memberInfo: z.object({
    name: z.string().min(1, 'Required'),
    massHealthId: z.string().min(1, 'Required'),
    dob: z.string().min(1, 'Required'),
    addressResidenceType: z.string(),
    primaryLanguage: z.string(),
    interpreterNeeded: z.enum(['Yes', 'No']),
  }),
  emergencyContact: z.object({
    name: z.string(),
    relationship: z.string(),
    phone: z.string(),
  }),
  primaryCareProvider: z.object({
    name: z.string(),
    phone: z.string(),
  }),
  dates: z.object({
    initialAssessment: z.string(),
    carePlan: z.string(),
  }),
  eligibility: z.object({
    assistanceWithADL: z.boolean(),
    approvedSetting: z.boolean(),
    noDuplicativeServices: z.boolean(),
    dailyPersonalCare: z.boolean(),
    monthlyCareManagement: z.boolean(),
  }),
  medicalConditions: z.string(),
  functionalAssessment: z.object({
    bathing: z.enum(adlLevels),
    dressing: z.enum(adlLevels),
    toileting: z.enum(adlLevels),
    ambulation: z.enum(adlLevels),
    transfers: z.enum(adlLevels),
    eating: z.enum(adlLevels),
    mealPrep: z.enum(iadlLevels),
    housekeeping: z.enum(iadlLevels),
    laundry: z.enum(iadlLevels),
    medicationReminders: z.enum(iadlLevels),
    shopping: z.enum(iadlLevels),
    notes: z.string(),
  }),
  goals: z.object({
    memberGoals: z.string(),
    providerGoals: z.string(),
  }),
  identifiedNeeds: z.object({
    personalCare: z.array(z.string()),
    personalCareOther: z.string(),
    careManagement: z.array(z.string()),
    careManagementOther: z.string(),
  }),
  interventions: z.array(z.object({
    needGoal: z.string(),
    intervention: z.string(),
    responsibleParty: z.string(),
    frequency: z.string(),
  })),
  riskAssessment: z.object({
    risks: z.array(z.string()),
    risksOther: z.string(),
    mitigationStrategies: z.string(),
  }),
  memberStrengths: z.array(z.string()),
  memberStrengthsOther: z.string(),
  memberPreferences: z.object({
    dailyRoutines: z.string(),
    culturalReligious: z.string(),
    foodPreferences: z.string(),
    communicationPreferences: z.string(),
    caregiverGenderPreference: z.string(),
    privacyPreferences: z.string(),
  }),
  monthlyReview: z.object({
    completedBy: z.string(),
    observations: z.string(),
    changesInCondition: z.string(),
    medicationChanges: z.string(),
    referralsMade: z.string(),
    carePlanUpdated: z.enum(['Yes', 'No']),
  }),
  signatures: z.object({
    memberSignature: z.string().min(1, 'Required'),
    memberDate: z.string().min(1, 'Required'),
    careManagerSignature: z.string().min(1, 'Required'),
    careManagerDate: z.string().min(1, 'Required'),
    nurseReviewer: z.string(),
    nurseDate: z.string(),
  }),
});

type CarePlanValues = z.infer<typeof carePlanSchema>;

export const GAFCCarePlan: React.FC = () => {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPatientId = searchParams.get('patientId');
  const editId = searchParams.get('id');
  const [patientId, setPatientId] = useState<string | null>(urlPatientId);
  const [patients, setPatients] = useState<any[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [notification, setNotification] = useState<{ type: NotificationType, message: string } | null>(null);

  const { register, control, handleSubmit, setValue, watch, reset, getValues, formState: { errors, isSubmitting } } = useForm<CarePlanValues>({
    resolver: zodResolver(carePlanSchema),
    defaultValues: {
      memberInfo: { interpreterNeeded: 'No' },
      eligibility: {
        assistanceWithADL: true,
        approvedSetting: true,
        noDuplicativeServices: true,
        dailyPersonalCare: true,
        monthlyCareManagement: true,
      },
      functionalAssessment: {
        bathing: 'Independent',
        dressing: 'Independent',
        toileting: 'Independent',
        ambulation: 'Independent',
        transfers: 'Independent',
        eating: 'Independent',
        mealPrep: 'Independent',
        housekeeping: 'Independent',
        laundry: 'Independent',
        medicationReminders: 'Independent',
        shopping: 'Independent',
      },
      identifiedNeeds: { personalCare: [], careManagement: [] },
      interventions: [{ needGoal: '', intervention: '', responsibleParty: '', frequency: '' }],
      riskAssessment: { risks: [] },
      memberStrengths: [],
      monthlyReview: { carePlanUpdated: 'No' },
      dates: {
        carePlan: new Date().toISOString().split('T')[0],
      },
      signatures: {
        memberDate: new Date().toISOString().split('T')[0],
        careManagerDate: new Date().toISOString().split('T')[0],
      }
    }
  });

  // Load existing submission when opened via View Form
  useEffect(() => {
    if (editId) {
      const fetchSubmission = async () => {
        try {
          const { data, error } = await supabase
            .from('form_responses')
            .select('*')
            .eq('id', editId)
            .single();
          if (data && !error) {
            reset(data.data);
            if (data.patient_id) setPatientId(data.patient_id);
          }
        } catch (err) {
          console.error('GAFCCarePlan: Error fetching submission:', err);
        }
      };
      fetchSubmission();
    }
  }, [editId, reset]);

  useEffect(() => {
    const fetchPatients = async () => {
      setIsLoadingPatients(true);
      try {
        const { data, error } = await supabase
          .from('patients')
          .select('id, first_name, last_name')
          .order('last_name', { ascending: true });
        if (data) setPatients(data);
      } finally {
        setIsLoadingPatients(false);
      }
    };
    fetchPatients();
  }, []);

  useEffect(() => {
    if (patientId) {
      const fetchPatient = async () => {
        const { data, error } = await supabase
          .from('patients')
          .select('*')
          .eq('id', patientId)
          .single();
        
        if (data && !error) {
          setValue('memberInfo.name', `${data.first_name} ${data.last_name}`);
          if (data.dob) setValue('memberInfo.dob', data.dob);
          if (data.insurance_id) setValue('memberInfo.massHealthId', data.insurance_id);
          if (data.primary_language) setValue('memberInfo.primaryLanguage', data.primary_language);
          
          if (data.emergency_contact_name) setValue('emergencyContact.name', data.emergency_contact_name);
          if (data.emergency_contact_relationship) setValue('emergencyContact.relationship', data.emergency_contact_relationship);
          if (data.emergency_contact_phone) setValue('emergencyContact.phone', data.emergency_contact_phone);
          
          if (data.pcp_id) setValue('primaryCareProvider.name', data.pcp_id);
          
          if (data.religion) setValue('memberPreferences.culturalReligious', data.religion);

          // Auto-populate medical conditions from diagnoses
          if (data.diagnoses && data.diagnoses.length > 0) {
            const diagList = data.diagnoses.map((d: any) => `${d.disease} (${d.icd10})`).join(', ');
            setValue('medicalConditions', diagList);
          }

          // Auto-populate medication changes if available
          if (data.medications && data.medications.length > 0) {
            const medList = data.medications.map((m: any) => `${m.medicine} (${m.dosage})`).join('\n');
            setValue('monthlyReview.medicationChanges', medList);
          }
        } else {
          setPatientId(null);
        }
      };
      fetchPatient();
    }
  }, [patientId, setValue]);

  const handlePatientChange = (id: string) => {
    setPatientId(id);
    const newParams = new URLSearchParams(searchParams);
    if (id) {
      newParams.set('patientId', id);
    } else {
      newParams.delete('patientId');
    }
    setSearchParams(newParams);
  };

  const { fields, append, remove } = useFieldArray({ control, name: 'interventions' });

  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [formId, setFormId] = useState<string | null>(null);
  const [isFetchingForm, setIsFetchingForm] = useState(true);

  useEffect(() => {
    const fetchFormId = async () => {
      try {
        const id = await getFormIdByName(FORM_NAME);
        setFormId(id);
      } finally {
        setIsFetchingForm(false);
      }
    };
    fetchFormId();
  }, []);

  const submitForm = async (data: CarePlanValues, status: 'draft' | 'submitted') => {
    if (!profile) {
      setNotification({ type: 'error', message: 'You must be logged in to submit care plans.' });
      return;
    }

    console.log(`GAFC Care Plan: Starting submission (status: ${status})...`);
    try {
      if (status === 'draft') setIsSavingDraft(true);
      
      // 1. Get Form ID if not already fetched
      let currentFormId = formId;
      if (!currentFormId) {
        console.log(`GAFC Care Plan: Form ID missing, fetching for "${FORM_NAME}"...`);
        currentFormId = (await withTimeout(getFormIdByName(FORM_NAME))) as any;
        if (!currentFormId) {
          throw new Error(`The "${FORM_NAME}" form is missing from the database. Please go to the Dashboard to run the Database Setup.`);
        }
        setFormId(currentFormId);
      }
      
      if (!patientId && !data.memberInfo.name) {
        throw new Error('Please select a patient or enter a name before submitting the form.');
      }

      console.log(`GAFC Care Plan: Using Form ID: ${currentFormId}, Patient ID: ${patientId || 'Manual Entry'}`);

      // 1.5 Verify patient exists if ID is provided
      if (patientId) {
        const { data: patientExists, error: patientCheckError } = (await withTimeout(supabase
          .from('patients')
          .select('id')
          .eq('id', patientId)
          .maybeSingle(), 60000)) as any;
        
        if (patientCheckError) {
          console.error('GAFC Care Plan: Patient check error:', patientCheckError);
        }
        
        if (!patientExists) {
          console.warn(`GAFC Care Plan: Patient ID ${patientId} not found, proceeding as manual entry.`);
        }
      }

      // 2. Insert into form_responses
      const { data: responseData, error: responseError } = await supabase
        .from('form_responses')
        .insert([{
          form_id: currentFormId,
          patient_id: patientId,
          staff_id: profile.id,
          data: data,
          status: status
        }])
        .select('id')
        .maybeSingle();
      
      if (responseError) {
        console.error('GAFC Care Plan: Response insertion error:', responseError);
        throw responseError;
      }

      const responseId = responseData?.id ?? null;

      console.log('GAFC Care Plan: Response submitted successfully, ID:', responseId);

      // 3. Insert care manager signature into signatures table
      if (data.signatures.careManagerSignature) {
        console.log('GAFC Care Plan: Inserting care manager signature...');
        const { error: sigError } = await supabase
          .from('signatures')
          .insert([{
            parent_id: responseId,
            parent_type: 'form_response',
            signer_id: profile.id,
            signature_data: data.signatures.careManagerSignature
          }]);
        
        if (sigError) {
          console.error('GAFC Care Plan: Care manager signature insertion error:', sigError);
          throw sigError;
        }
        console.log('GAFC Care Plan: Care manager signature inserted successfully');
      }
      
      setNotification({ 
        type: 'success', 
        message: status === 'draft' ? 'Draft saved successfully!' : 'Care plan submitted successfully!' 
      });
      if (status === 'submitted') {
        reset();
      }
    } catch (error: any) {
      console.error('GAFC Care Plan: Caught error during submission:', error);
      setNotification({ type: 'error', message: `Error submitting form: ${error.message || 'Please try again.'}` });
    } finally {
      setIsSavingDraft(false);
      console.log('GAFC Care Plan: Submission process finished.');
    }
  };

  const onSubmit = async (data: CarePlanValues) => await submitForm(data, 'submitted');
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const handlePrint = async () => {
    console.log('GAFC Care Plan: Starting PDF generation...');
    try {
      setIsGeneratingPDF(true);
      const formData = getValues();
      console.log('GAFC Care Plan: Form data for PDF:', formData);
      await generateFormPDF(FORM_NAME, formData);
      console.log('GAFC Care Plan: PDF generation successful.');
    } catch (error) {
      console.error('GAFC Care Plan: PDF error:', error);
      setNotification({ type: 'error', message: 'Failed to generate PDF. Please try again.' });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      <Link to="/clinical-forms" className="flex items-center gap-2 text-zinc-500 hover:text-partners-blue-dark transition-colors group no-print">
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-sm font-medium">Back to Forms</span>
      </Link>
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Logo showText size={48} />
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-partners-blue-dark flex items-center gap-2">
              <ClipboardList className="text-partners-green shrink-0" />
              GAFC CARE PLAN
            </h2>
            <p className="text-sm md:text-base text-partners-gray">Comprehensive MassHealth GAFC Care Plan Template.</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full md:w-auto md:justify-end no-print">
          <div className="w-full sm:w-64">
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1 ml-1">Select Patient</label>
            <select 
              value={patientId || ''} 
              onChange={(e) => handlePatientChange(e.target.value)}
              className="w-full h-10 px-4 rounded-xl border border-zinc-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-partners-blue-dark transition-all appearance-none cursor-pointer shadow-sm"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1.25rem' }}
            >
              <option value="">-- Choose a Patient --</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-row items-center justify-end gap-3 w-full sm:w-auto mt-auto">
            <Button 
              variant="secondary" 
              type="button" 
              onClick={() => setIsPreviewOpen(true)}
              className="h-10 px-4 rounded-xl shadow-sm"
            >
              <FileText className="w-4 h-4 mr-2" />
              Preview & Print
            </Button>
            <Button 
              type="button"
              onClick={handleSubmit(onSubmit)}
              disabled={isSubmitting}
              className="h-10 px-4 rounded-xl shadow-md bg-partners-blue-dark hover:bg-partners-blue transition-all active:scale-95"
            >
              <Send className="w-4 h-4 mr-2" />
              {isSubmitting ? 'Submitting...' : 'Submit Form'}
            </Button>
          </div>
        </div>
      </div>

      <PrintPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        template={GAFCCarePlanTemplate}
        data={getValues()}
        title="GAFC Care Plan"
        filename={`GAFC_Care_Plan_${getValues().memberInfo?.name?.replace(/\s+/g, '_')}.pdf`}
      />

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-10 bg-white p-4 sm:p-8 rounded-2xl border border-zinc-200 shadow-sm overflow-hidden"
      >
        {Object.keys(errors).length > 0 && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-xl">
            <p className="text-sm text-red-600 font-bold mb-1">Please fix the following errors:</p>
            <ul className="list-disc ml-5 text-xs text-red-500">
              {Object.entries(errors).map(([key, error]) => (
                <li key={key}>{(error as any).message || `${key} is invalid`}</li>
              ))}
            </ul>
          </div>
        )}
        {/* Member Information */}
        <section className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2 uppercase tracking-wider">Member Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Member Name <span className="text-red-500">*</span></label>
              <input 
                {...register('memberInfo.name')} 
                placeholder="Enter full name"
                className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" 
              />
              {errors.memberInfo?.name && <p className="text-xs text-red-500">{errors.memberInfo.name.message}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">MassHealth ID <span className="text-red-500">*</span></label>
              <input {...register('memberInfo.massHealthId')} placeholder="ID Number" className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Date of Birth <span className="text-red-500">*</span></label>
              <input type="date" {...register('memberInfo.dob')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Address / Residence Type</label>
              <input {...register('memberInfo.addressResidenceType')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Primary Language</label>
              <input {...register('memberInfo.primaryLanguage')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Interpreter Needed</label>
              <div className="flex gap-4">
                {['Yes', 'No'].map(val => (
                  <label key={val} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value={val} {...register('memberInfo.interpreterNeeded')} className="w-4 h-4 text-partners-blue-dark" />
                    <span className="text-sm">{val}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-zinc-100">
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-zinc-900 uppercase">Emergency Contact</h4>
              <div className="grid grid-cols-1 gap-4">
                <input {...register('emergencyContact.name')} placeholder="Name" className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
                <input {...register('emergencyContact.relationship')} placeholder="Relationship" className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
                <input {...register('emergencyContact.phone')} placeholder="Phone" className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-zinc-900 uppercase">Primary Care Provider</h4>
              <div className="grid grid-cols-1 gap-4">
                <input {...register('primaryCareProvider.name')} placeholder="Name" className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
                <input {...register('primaryCareProvider.phone')} placeholder="Phone" className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-zinc-100">
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Date of Initial Assessment</label>
              <input type="date" {...register('dates.initialAssessment')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Date of Care Plan</label>
              <input type="date" {...register('dates.carePlan')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
            </div>
          </div>
        </section>

        {/* Eligibility Confirmation */}
        <section className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2 uppercase tracking-wider">Eligibility Confirmation</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: 'assistanceWithADL', label: 'Member requires assistance with at least one ADL' },
              { key: 'approvedSetting', label: 'Member resides in a GAFC approved setting' },
              { key: 'noDuplicativeServices', label: 'No duplicative services (PCA, AFC, etc.)' },
              { key: 'dailyPersonalCare', label: 'Requires daily personal care services' },
              { key: 'monthlyCareManagement', label: 'Requires monthly care management' },
            ].map(item => (
              <label key={item.key} className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-zinc-50 transition-colors">
                <input type="checkbox" {...register(`eligibility.${item.key}` as any)} className="w-5 h-5 rounded border-zinc-300 text-partners-blue-dark" />
                <span className="text-sm font-medium text-zinc-700">{item.label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Medical Conditions */}
        <section className="bg-white p-4 sm:p-8 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2 uppercase tracking-wider">Medical Conditions / Diagnoses</h3>
          <textarea {...register('medicalConditions')} rows={4} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
        </section>

        {/* Functional Assessment */}
        <section className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2 uppercase tracking-wider">Functional Assessment (ADLs & IADLs)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              {['bathing', 'dressing', 'toileting', 'ambulation', 'transfers', 'eating'].map(adl => (
                <div key={adl} className="space-y-2">
                  <label className="text-sm font-bold text-zinc-900 uppercase tracking-tight">{adl}</label>
                  <div className="flex flex-wrap gap-2">
                    {adlLevels.map(level => (
                      <label key={level} className="flex items-center gap-1 cursor-pointer bg-zinc-50 px-3 py-1.5 rounded-lg border border-zinc-200 hover:border-partners-blue-dark transition-colors">
                        <input type="radio" value={level} {...register(`functionalAssessment.${adl}` as any)} className="w-4 h-4 text-partners-blue-dark" />
                        <span className="text-xs font-medium">{level}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-6">
              {['mealPrep', 'housekeeping', 'laundry', 'medicationReminders', 'shopping'].map(iadl => (
                <div key={iadl} className="space-y-2">
                  <label className="text-sm font-bold text-zinc-900 uppercase tracking-tight">{iadl.replace(/([A-Z])/g, ' $1')}</label>
                  <div className="flex flex-wrap gap-2">
                    {iadlLevels.map(level => (
                      <label key={level} className="flex items-center gap-1 cursor-pointer bg-zinc-50 px-3 py-1.5 rounded-lg border border-zinc-200 hover:border-partners-blue-dark transition-colors">
                        <input type="radio" value={level} {...register(`functionalAssessment.${iadl}` as any)} className="w-4 h-4 text-partners-blue-dark" />
                        <span className="text-xs font-medium">{level}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div className="space-y-2 pt-4">
                <label className="text-sm font-bold text-zinc-900 uppercase tracking-tight">Notes</label>
                <textarea {...register('functionalAssessment.notes')} rows={3} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
              </div>
            </div>
          </div>
        </section>

        {/* Member Centered Goals */}
        <section className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2 uppercase tracking-wider">Member Centered Goals</h3>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">A. Member’s Own Goals (in their words):</label>
              <textarea {...register('goals.memberGoals')} rows={3} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">B. Provider Goals:</label>
              <textarea {...register('goals.providerGoals')} rows={3} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
            </div>
          </div>
        </section>

        {/* Identified Needs & Services */}
        <section className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm space-y-8">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2 uppercase tracking-wider">Identified Needs & Services</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-zinc-900 uppercase">Personal Care Needs</h4>
              <div className="grid grid-cols-1 gap-2">
                {[
                  'Bathing assistance', 'Dressing assistance', 'Toileting assistance', 
                  'Mobility support', 'Medication reminders', 'Meal preparation', 'Safety monitoring'
                ].map(need => (
                  <label key={need} className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" value={need} {...register('identifiedNeeds.personalCare')} className="w-5 h-5 rounded border-zinc-300 text-partners-blue-dark" />
                    <span className="text-sm text-zinc-700">{need}</span>
                  </label>
                ))}
                <div className="flex items-center gap-3 pt-2">
                  <span className="text-sm text-zinc-700">Other:</span>
                  <input {...register('identifiedNeeds.personalCareOther')} className="flex-1 border-b border-zinc-300 focus:border-partners-blue-dark outline-none px-2 py-1 text-sm" />
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-zinc-900 uppercase">Care Management Needs</h4>
              <div className="grid grid-cols-1 gap-2">
                {[
                  'Monthly in person visit', 'Care coordination', 'Monitoring of service delivery',
                  'Psychosocial support', 'Advocacy'
                ].map(need => (
                  <label key={need} className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" value={need} {...register('identifiedNeeds.careManagement')} className="w-5 h-5 rounded border-zinc-300 text-partners-blue-dark" />
                    <span className="text-sm text-zinc-700">{need}</span>
                  </label>
                ))}
                <div className="flex items-center gap-3 pt-2">
                  <span className="text-sm text-zinc-700">Other:</span>
                  <input {...register('identifiedNeeds.careManagementOther')} className="flex-1 border-b border-zinc-300 focus:border-partners-blue-dark outline-none px-2 py-1 text-sm" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Interventions Table */}
        <section className="bg-white p-4 md:p-8 rounded-2xl border border-zinc-200 shadow-sm space-y-6 overflow-x-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b pb-2 gap-4">
            <h3 className="text-lg font-bold text-zinc-900 uppercase tracking-wider">Interventions, Frequency & Responsible Party</h3>
            <Button type="button" variant="secondary" size="sm" onClick={() => append({ needGoal: '', intervention: '', responsibleParty: '', frequency: '' })}>
              <Plus className="w-4 h-4 mr-1" /> Add Row
            </Button>
          </div>
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b border-zinc-200">
                <th className="py-3 px-4 text-xs font-bold text-zinc-500 uppercase">Need / Goal</th>
                <th className="py-3 px-4 text-xs font-bold text-zinc-500 uppercase">Intervention</th>
                <th className="py-3 px-4 text-xs font-bold text-zinc-500 uppercase">Responsible Party</th>
                <th className="py-3 px-4 text-xs font-bold text-zinc-500 uppercase">Frequency</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field.id} className="border-b border-zinc-100">
                  <td className="py-2 px-2"><input {...register(`interventions.${index}.needGoal`)} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-sm" /></td>
                  <td className="py-2 px-2"><input {...register(`interventions.${index}.intervention`)} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-sm" /></td>
                  <td className="py-2 px-2"><input {...register(`interventions.${index}.responsibleParty`)} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-sm" /></td>
                  <td className="py-2 px-2"><input {...register(`interventions.${index}.frequency`)} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-sm" /></td>
                  <td className="py-2 px-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} className="text-red-500">
                      <Trash2 size={16} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>

        {/* Risk Assessment */}
        <section className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm space-y-8">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2 uppercase tracking-wider">Risk Assessment</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-zinc-900 uppercase">Risks Identified</h4>
              <div className="grid grid-cols-1 gap-2">
                {[
                  'Fall risk', 'Medication non adherence', 'Cognitive impairment',
                  'Social isolation', 'Poor nutrition', 'Behavioral health concerns'
                ].map(risk => (
                  <label key={risk} className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" value={risk} {...register('riskAssessment.risks')} className="w-5 h-5 rounded border-zinc-300 text-partners-blue-dark" />
                    <span className="text-sm text-zinc-700">{risk}</span>
                  </label>
                ))}
                <div className="flex items-center gap-3 pt-2">
                  <span className="text-sm text-zinc-700">Other:</span>
                  <input {...register('riskAssessment.risksOther')} className="flex-1 border-b border-zinc-300 focus:border-partners-blue-dark outline-none px-2 py-1 text-sm" />
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-zinc-900 uppercase">Mitigation Strategies</h4>
              <textarea {...register('riskAssessment.mitigationStrategies')} rows={6} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
            </div>
          </div>
        </section>

        {/* Member Strengths */}
        <section className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2 uppercase tracking-wider">Member Strengths</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              'Motivated to remain independent', 'Supportive family/community',
              'Engages with staff', 'Stable medical conditions'
            ].map(strength => (
              <label key={strength} className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" value={strength} {...register('memberStrengths')} className="w-5 h-5 rounded border-zinc-300 text-partners-blue-dark" />
                <span className="text-sm text-zinc-700">{strength}</span>
              </label>
            ))}
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-700">Other:</span>
              <input {...register('memberStrengthsOther')} className="flex-1 border-b border-zinc-300 focus:border-partners-blue-dark outline-none px-2 py-1 text-sm" />
            </div>
          </div>
        </section>

        {/* Member Preferences */}
        <section className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2 uppercase tracking-wider">Member Preferences</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { key: 'dailyRoutines', label: 'Daily routines' },
              { key: 'culturalReligious', label: 'Cultural/religious considerations' },
              { key: 'foodPreferences', label: 'Food preferences' },
              { key: 'communicationPreferences', label: 'Communication preferences' },
              { key: 'caregiverGenderPreference', label: 'Caregiver gender preference' },
              { key: 'privacyPreferences', label: 'Privacy preferences' },
            ].map(pref => (
              <div key={pref.key} className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">{pref.label}</label>
                <input {...register(`memberPreferences.${pref.key}` as any)} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
              </div>
            ))}
          </div>
        </section>

        {/* Monthly Care Management Review */}
        <section className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2 uppercase tracking-wider">Monthly Care Management Review</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Monthly Visit Completed By</label>
              <input {...register('monthlyReview.completedBy')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Observations</label>
              <input {...register('monthlyReview.observations')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Changes in Condition</label>
              <input {...register('monthlyReview.changesInCondition')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Medication Changes</label>
              <input {...register('monthlyReview.medicationChanges')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Referrals Made</label>
              <input {...register('monthlyReview.referralsMade')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Care Plan Updated</label>
              <div className="flex gap-4">
                {['Yes', 'No'].map(val => (
                  <label key={val} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value={val} {...register('monthlyReview.carePlanUpdated')} className="w-4 h-4 text-partners-blue-dark" />
                    <span className="text-sm">{val}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Care Plan Agreement */}
        <section className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm space-y-8">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2 uppercase tracking-wider">Care Plan Agreement</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-4">
              <SignaturePad label="Member Signature" onSave={(sig) => setValue('signatures.memberSignature', sig, { shouldValidate: true })} initialValue={watch('signatures.memberSignature')} />
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-500 uppercase">Date</label>
                <input type="date" {...register('signatures.memberDate')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
              </div>
            </div>
            <div className="space-y-4">
              <SignaturePad label="Care Manager Signature" onSave={(sig) => setValue('signatures.careManagerSignature', sig, { shouldValidate: true })} initialValue={watch('signatures.careManagerSignature')} />
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-500 uppercase">Date</label>
                <input type="date" {...register('signatures.careManagerDate')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
              </div>
            </div>
            <div className="space-y-4 col-span-full pt-6 border-t border-zinc-100">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">Nurse Reviewer (if applicable)</label>
                  <input {...register('signatures.nurseReviewer')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">Date</label>
                  <input type="date" {...register('signatures.nurseDate')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
                </div>
              </div>
            </div>
          </div>
        </section>
        <div className="flex justify-end pt-2 no-print">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-10 px-4 rounded-xl shadow-md bg-partners-blue-dark hover:bg-partners-blue transition-all active:scale-95"
          >
            <Send className="w-4 h-4 mr-2" />
            {isSubmitting ? 'Submitting...' : 'Submit Form'}
          </Button>
        </div>
      </form>
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
