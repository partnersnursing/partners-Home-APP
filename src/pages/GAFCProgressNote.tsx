import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams, Link } from 'react-router-dom';
import * as z from 'zod';
import { Button } from '../components/Button';
import { FileText, Printer, Send, ArrowLeft, Loader2 } from 'lucide-react';
import { SignaturePad } from '../components/SignaturePad';
import { Notification, NotificationType } from '../components/Notification';
import { supabase, getFormIdByName, withTimeout } from '../services/supabase';
import { generateFormPDF } from '../services/pdfService';
import { PrintPreviewModal } from '../components/PrintPreviewModal';
import { GAFCProgressNoteTemplate } from '../components/PDFTemplates/GAFCProgressNoteTemplate';
import { useAuth } from '../context/AuthContext';

import { Logo } from '../components/Logo';

const adlLevels = ['Independent', 'Needs Cueing', 'Needs Assistance', 'Dependent'] as const;

const FORM_NAME = 'GAFC Progress Note';

const gafcSchema = z.object({
  participantName: z.string().min(1, 'Required'),
  dob: z.string().min(1, 'Required'),
  gafcProvider: z.string().min(1, 'Required'),
  visitDate: z.string().min(1, 'Required'),
  visitTime: z.string().min(1, 'Required'),
  location: z.string().min(1, 'Required'),
  staffNameTitle: z.string().min(1, 'Required'),
  reasonForVisit: z.string().min(1, 'Required'),
  
  subjective: z.object({
    currentConcerns: z.string().optional(),
    changesSinceLastVisit: z.string().optional(),
    painSymptoms: z.string().optional(),
    moodMentalStatus: z.string().optional(),
    participantComments: z.string().optional(),
  }),
  
  objective: z.object({
    generalAppearance: z.string().optional(),
    vitals: z.object({
      bp: z.string().optional(),
      hr: z.string().optional(),
      rr: z.string().optional(),
      temp: z.string().optional(),
      spo2: z.string().optional(),
    }),
    physicalAssessment: z.object({
      respiratory: z.string().optional(),
      cardiac: z.string().optional(),
      skinIntegrity: z.string().optional(),
      mobilityGait: z.string().optional(),
      nutritionAppetite: z.string().optional(),
    }),
  }),
  
  environmentSafety: z.object({
    cleanliness: z.string().optional(),
    clutterHazards: z.string().optional(),
    functioningUtilities: z.string().optional(),
    emergencyPlanAwareness: z.string().optional(),
  }),
  
  medicationReview: z.object({
    presentAndLabeled: z.enum(['Yes', 'No']).optional(),
    ableToSelfAdminister: z.enum(['Yes', 'No']).optional(),
    issuesNoted: z.string().optional(),
  }),
  
  adls: z.record(z.string(), z.object({
    level: z.enum(adlLevels).optional(),
    notes: z.string().optional(),
  })),
  
  assessment: z.string().optional(),
  interventions: z.array(z.string()).optional(),
  education: z.string().optional(),
  
  plan: z.object({
    followUpActions: z.string().optional(),
    referralsCoordination: z.string().optional(),
    nextScheduledVisit: z.string().optional(),
    participantInstructedToReport: z.string().optional(),
  }),
  
  staffSignature: z.string().min(1, 'Signature required'),
  signatureDate: z.string().min(1, 'Required'),
});

type GAFCFormValues = z.infer<typeof gafcSchema>;

const ADL_TASKS = [
  'Bathing', 'Dressing', 'Grooming', 'Toileting', 'Mobility', 'Meal Prep', 'Housekeeping', 'Medication Mgmt'
];

export const GAFCProgressNote: React.FC = () => {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPatientId = searchParams.get('patientId');
  const visitIdFromUrl = searchParams.get('visitId');
  const [patientId, setPatientId] = useState<string | null>(urlPatientId);
  const [patients, setPatients] = useState<any[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [notification, setNotification] = useState<{ type: NotificationType, message: string } | null>(null);

  const { register, handleSubmit, setValue, watch, reset, getValues, formState: { errors, isSubmitting } } = useForm<GAFCFormValues>({
    resolver: zodResolver(gafcSchema),
    defaultValues: {
      visitDate: new Date().toISOString().split('T')[0],
      signatureDate: new Date().toISOString().split('T')[0],
      medicationReview: {
        presentAndLabeled: 'Yes',
        ableToSelfAdminister: 'Yes',
      },
      adls: ADL_TASKS.reduce((acc, task) => ({
        ...acc,
        [task]: { level: 'Independent', notes: '' }
      }), {}),
      interventions: ['', '', ''],
    }
  });

  const [formId, setFormId] = useState<string | null>(null);
  const [isFetchingForm, setIsFetchingForm] = useState(true);
  const editId = searchParams.get('id');

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
        } catch (error) {
          console.error('Error fetching submission for edit:', error);
        }
      };
      fetchSubmission();
    }
  }, [editId, reset]);

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
          setValue('participantName', `${data.first_name} ${data.last_name}`);
          if (data.dob) setValue('dob', data.dob);
          if (data.pcp_id) setValue('gafcProvider', data.pcp_id);
          
          const fullAddress = [
            data.street,
            data.apt,
            data.city,
            data.state,
            data.zip
          ].filter(Boolean).join(', ');
          
          if (fullAddress) setValue('location', fullAddress);

          // Auto-populate medications if available
          if (data.medications && data.medications.length > 0) {
            const medList = data.medications.map((m: any) => `${m.medicine} (${m.dosage}) - ${m.schedule}`).join('\n');
            setValue('medicationReview.issuesNoted', `Current Medications:\n${medList}`);
          }
        } else {
          // If patient doesn't exist, clear patientId
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

  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const submitForm = async (data: GAFCFormValues, status: 'draft' | 'submitted') => {
    if (!profile) {
      setNotification({ type: 'error', message: 'You must be logged in to submit notes.' });
      return;
    }

    console.log(`GAFC Note: Starting submission (status: ${status})...`);
    try {
      if (status === 'draft') setIsSavingDraft(true);
      
      // 1. Get Form ID if not already fetched
      let currentFormId = formId;
      if (!currentFormId) {
        console.log(`GAFC Note: Form ID missing, fetching for "${FORM_NAME}"...`);
        currentFormId = (await withTimeout(getFormIdByName(FORM_NAME))) as any;
        if (!currentFormId) {
          throw new Error(`The "${FORM_NAME}" form is missing from the database. Please go to the Dashboard to run the Database Setup.`);
        }
        setFormId(currentFormId);
      }
      
      if (!patientId && !data.participantName) {
        throw new Error('Please select a patient or enter a name before submitting the form.');
      }

      console.log(`GAFC Note: Using Form ID: ${currentFormId}, Patient ID: ${patientId || 'Manual Entry'}`);

      // 1.5 Verify patient exists if ID is provided
      if (patientId) {
        const { data: patientExists, error: patientCheckError } = (await withTimeout(supabase
          .from('patients')
          .select('id')
          .eq('id', patientId)
          .maybeSingle(), 60000)) as any;
        
        if (patientCheckError) {
          console.error('GAFC Note: Patient check error:', patientCheckError);
        }
        
        if (!patientExists) {
          console.warn(`GAFC Note: Patient ID ${patientId} not found, proceeding as manual entry.`);
          // We could set patientId to null here if we want to allow submission anyway
        }
      }

      // 2. Insert or Update form_responses
      let responseData;
      if (editId) {
        const { error } = await supabase
          .from('form_responses')
          .update({
            data: data,
            status: status,
            visit_id: visitIdFromUrl || undefined,
            updated_at: new Date().toISOString()
          })
          .eq('id', editId);
        
        if (error) throw error;
        responseData = { id: editId };
      } else {
        const { data: insertResult, error } = await supabase
          .from('form_responses')
          .insert([{
            form_id: currentFormId,
            patient_id: patientId,
            staff_id: profile.id,
            visit_id: visitIdFromUrl || null,
            data: data,
            status: status
          }])
          .select('id')
          .limit(1);
        
        if (error) throw error;
        responseData = Array.isArray(insertResult) ? insertResult[0] : insertResult;
      }
      
      // responseData may be null if RLS blocks SELECT after write — the write still succeeded
      const responseId = responseData?.id ?? editId ?? null;

      console.log('GAFC Note: Response submitted successfully, ID:', responseId);

      // 3. Insert signature if present
      if (data.staffSignature && responseId) {
        console.log('GAFC Note: Inserting signature...');
        const { error: sigError } = await supabase
          .from('signatures')
          .insert([{
            parent_id: responseId,
            parent_type: 'form_response',
            signer_id: profile.id,
            signature_data: data.staffSignature
          }]);
        
        if (sigError) {
          console.error('GAFC Note: Signature insertion error:', sigError);
          throw sigError;
        }
        console.log('GAFC Note: Signature inserted successfully');
      }
      
      setNotification({ 
        type: 'success', 
        message: status === 'draft' ? 'Draft saved successfully!' : editId ? 'Progress note updated successfully!' : 'Progress note submitted successfully!' 
      });
      if (status === 'submitted' && !editId) {
        reset();
      }
    } catch (error: any) {
      console.error('GAFC Note: Caught error during submission:', error);
      setNotification({ type: 'error', message: `Error submitting form: ${error.message || 'Please try again.'}` });
    } finally {
      setIsSavingDraft(false);
      console.log('GAFC Note: Submission process finished.');
    }
  };

  const onSubmit = async (data: GAFCFormValues) => await submitForm(data, 'submitted');
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const handlePrint = async () => {
    console.log('GAFC Progress Note: Starting PDF generation...');
    try {
      setIsGeneratingPDF(true);
      const formData = getValues();
      console.log('GAFC Progress Note: Form data for PDF:', formData);
      await generateFormPDF(FORM_NAME, formData);
      console.log('GAFC Progress Note: PDF generation successful.');
    } catch (error) {
      console.error('GAFC Progress Note: PDF error:', error);
      setNotification({ type: 'error', message: 'Failed to generate PDF. Please try again.' });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      <Link to="/clinical-forms" className="flex items-center gap-2 text-zinc-500 hover:text-partners-blue-dark transition-colors mb-6 group no-print">
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-sm font-medium">Back to Forms</span>
      </Link>
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Logo showText size={48} />
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-partners-blue-dark flex items-center gap-2">
              <FileText className="text-partners-green shrink-0" />
              GAFC Progress Note Form
            </h2>
            <p className="text-sm md:text-base text-partners-gray">Complete the monthly clinical progress note.</p>
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
              {isSubmitting ? 'Submitting...' : 'Submit Note'}
            </Button>
          </div>
        </div>
      </div>

      <PrintPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        template={GAFCProgressNoteTemplate}
        data={getValues()}
        title="GAFC Progress Note"
        filename={`GAFC_Progress_Note_${getValues().participantName?.replace(/\s+/g, '_')}.pdf`}
      />

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-8 bg-white p-4 sm:p-8 rounded-2xl border border-zinc-200 shadow-sm overflow-hidden"
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
        {/* Header Information */}
        <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">Participant Name <span className="text-red-500">*</span></label>
            <input 
              {...register('participantName')} 
              placeholder="Enter full name"
              className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" 
            />
            {errors.participantName && <p className="text-xs text-red-500">{errors.participantName.message}</p>}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">DOB <span className="text-red-500">*</span></label>
            <input type="date" {...register('dob')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">GAFC Provider <span className="text-red-500">*</span></label>
            <input {...register('gafcProvider')} placeholder="Provider Name" className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">Date of Visit <span className="text-red-500">*</span></label>
            <input type="date" {...register('visitDate')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">Time of Visit <span className="text-red-500">*</span></label>
            <input type="time" {...register('visitTime')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">Location <span className="text-red-500">*</span></label>
            <input {...register('location')} placeholder="Home, Office, etc." className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
          </div>
          <div className="space-y-1 col-span-full">
            <label className="text-sm font-medium text-zinc-700">Staff Name & Title <span className="text-red-500">*</span></label>
            <input {...register('staffNameTitle')} placeholder="Your Name, RN/CM" className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
          </div>
        </section>

        {/* Reason for Visit */}
        <section className="space-y-2">
          <label className="text-sm font-medium text-zinc-700">Reason for Visit <span className="text-red-500">*</span></label>
          <textarea {...register('reasonForVisit')} rows={2} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" placeholder="Example: Monthly GAFC nursing visit, follow up after medication change, safety check, etc." />
        </section>

        {/* Subjective */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2">Participant Report (Subjective)</h3>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">• Current concerns <span className="text-red-500">*</span></label>
              <input {...register('subjective.currentConcerns')} placeholder="Any current health or social concerns" className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">• Changes since last visit <span className="text-red-500">*</span></label>
              <input {...register('subjective.changesSinceLastVisit')} placeholder="New meds, hospitalizations, etc." className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">• Pain, symptoms, or new issues <span className="text-red-500">*</span></label>
              <input {...register('subjective.painSymptoms')} placeholder="Pain level, new symptoms" className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">• Mood/mental status as reported <span className="text-red-500">*</span></label>
              <input {...register('subjective.moodMentalStatus')} placeholder="How are they feeling emotionally?" className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">• Participant comments <span className="text-red-500">*</span></label>
              <textarea {...register('subjective.participantComments')} rows={2} placeholder="Direct quotes or specific feedback" className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
          </div>
        </section>

        {/* Objective */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2">Observations (Objective)</h3>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">General Appearance & Behavior</label>
              <input {...register('objective.generalAppearance')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500 uppercase">BP</label>
                <input {...register('objective.vitals.bp')} className="w-full px-3 py-2 rounded-lg border border-zinc-200" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500 uppercase">HR</label>
                <input {...register('objective.vitals.hr')} className="w-full px-3 py-2 rounded-lg border border-zinc-200" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500 uppercase">RR</label>
                <input {...register('objective.vitals.rr')} className="w-full px-3 py-2 rounded-lg border border-zinc-200" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500 uppercase">Temp</label>
                <input {...register('objective.vitals.temp')} className="w-full px-3 py-2 rounded-lg border border-zinc-200" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500 uppercase">SpO₂</label>
                <input {...register('objective.vitals.spo2')} className="w-full px-3 py-2 rounded-lg border border-zinc-200" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Respiratory</label>
                <input {...register('objective.physicalAssessment.respiratory')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Cardiac</label>
                <input {...register('objective.physicalAssessment.cardiac')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Skin integrity</label>
                <input {...register('objective.physicalAssessment.skinIntegrity')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Mobility/gait</label>
                <input {...register('objective.physicalAssessment.mobilityGait')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
              </div>
              <div className="space-y-1 col-span-full">
                <label className="text-sm font-medium text-zinc-700">Nutrition/appetite</label>
                <input {...register('objective.physicalAssessment.nutritionAppetite')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
              </div>
            </div>
          </div>
        </section>

        {/* Environment / Safety */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2">Environment / Safety Check</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Cleanliness</label>
              <input {...register('environmentSafety.cleanliness')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Clutter/hazards</label>
              <input {...register('environmentSafety.clutterHazards')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Functioning utilities</label>
              <input {...register('environmentSafety.functioningUtilities')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Emergency plan awareness</label>
              <input {...register('environmentSafety.emergencyPlanAwareness')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
          </div>
        </section>

        {/* Medication Review */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2">Medication Review</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Medications present and labeled</label>
              <div className="flex gap-4">
                {['Yes', 'No'].map(val => (
                  <label key={val} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value={val} {...register('medicationReview.presentAndLabeled')} className="w-4 h-4 text-partners-blue-dark" />
                    <span className="text-sm">{val}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Participant able to self administer</label>
              <div className="flex gap-4">
                {['Yes', 'No'].map(val => (
                  <label key={val} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value={val} {...register('medicationReview.ableToSelfAdminister')} className="w-4 h-4 text-partners-blue-dark" />
                    <span className="text-sm">{val}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1 col-span-full">
              <label className="text-sm font-medium text-zinc-700">Issues noted</label>
              <textarea {...register('medicationReview.issuesNoted')} rows={2} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
          </div>
        </section>

        {/* ADLs / IADLs Review */}
        <section className="space-y-4 overflow-x-auto">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2">ADLs / IADLs Review</h3>
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200">
                <th className="py-3 px-4 text-sm font-bold text-zinc-900">Task</th>
                {adlLevels.map(level => (
                  <th key={level} className="py-3 px-4 text-xs font-bold text-zinc-500 uppercase text-center">{level}</th>
                ))}
                <th className="py-3 px-4 text-sm font-bold text-zinc-900">Notes</th>
              </tr>
            </thead>
            <tbody>
              {ADL_TASKS.map(task => (
                <tr key={task} className="border-b border-zinc-100">
                  <td className="py-3 px-4 text-sm font-medium text-zinc-700">{task}</td>
                  {adlLevels.map(level => (
                    <td key={level} className="py-3 px-4 text-center">
                      <input 
                        type="radio" 
                        value={level} 
                        {...register(`adls.${task}.level`)} 
                        className="w-4 h-4 text-partners-blue-dark"
                      />
                    </td>
                  ))}
                  <td className="py-3 px-4">
                    <input {...register(`adls.${task}.notes`)} className="w-full px-3 py-1 text-sm rounded-lg border border-zinc-200" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>

        {/* Assessment & Interventions */}
        <section className="space-y-6">
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-zinc-900 border-b pb-2">Assessment</h3>
            <p className="text-xs text-zinc-500 mb-2">(Clinical impressions, stability, risks, changes in condition, GAFC eligibility indicators.)</p>
            <textarea {...register('assessment')} rows={4} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-bold text-zinc-900 border-b pb-2">Interventions Provided Today</h3>
            {[0, 1, 2].map(i => (
              <input key={i} {...register(`interventions.${i}`)} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" placeholder={`Intervention ${i + 1}`} />
            ))}
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-bold text-zinc-900 border-b pb-2">Education Provided</h3>
            <p className="text-xs text-zinc-500 mb-2">(Examples: medication adherence, fall prevention, chronic disease management.)</p>
            <textarea {...register('education')} rows={2} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
          </div>
        </section>

        {/* Plan */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-zinc-900 border-b pb-2">Plan</h3>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">• Follow up actions</label>
              <input {...register('plan.followUpActions')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">• Referrals/coordination</label>
              <input {...register('plan.referralsCoordination')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">• Next scheduled visit</label>
              <input {...register('plan.nextScheduledVisit')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">• Participant instructed to report</label>
              <input {...register('plan.participantInstructedToReport')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
          </div>
        </section>

        {/* Signature */}
        <section className="space-y-6 pt-6 border-t border-zinc-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <SignaturePad 
                label="Staff Signature" 
                onSave={(sig) => setValue('staffSignature', sig, { shouldValidate: true })}
                initialValue={watch('staffSignature')}
              />
              {errors.staffSignature && <p className="text-xs text-red-500">{errors.staffSignature.message}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Date</label>
              <input type="date" {...register('signatureDate')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
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
            {isSubmitting ? 'Submitting...' : 'Submit Note'}
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
