import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams, Link } from 'react-router-dom';
import * as z from 'zod';
import { Button } from '../components/Button';
import { Notification, NotificationType } from '../components/Notification';
import { Activity, Save, Send, Plus, Trash2, Calendar, Clock, User, ArrowLeft, Loader2, FileText } from 'lucide-react';
import { Logo } from '../components/Logo';
import { supabase, getFormIdByName, withTimeout } from '../services/supabase';
import { generateFormPDF } from '../services/pdfService';
import { PrintPreviewModal } from '../components/PrintPreviewModal';
import { TAR_Template } from '../components/PDFTemplates/TAR_Template';
import { useAuth } from '../context/AuthContext';

const DUMMY_PATIENT_ID = '00000000-0000-0000-0000-000000000000';
const FORM_NAME = 'Treatment Administration Record (TAR)';

const tarSchema = z.object({
  month: z.string().min(1, 'Required'),
  year: z.string().min(1, 'Required'),
  patient: z.object({
    name: z.string().min(1, 'Required'),
    dob: z.string().optional(),
  }),
  treatments: z.array(z.object({
    description: z.string().min(1, 'Required'),
    frequency: z.string().optional(),
    times: z.string().optional(),
    administrations: z.record(z.string(), z.string()), // day: initial
  })),
  staffSignatures: z.array(z.object({
    initials: z.string().optional(),
    name: z.string().optional(),
  })),
});

type TARFormValues = z.infer<typeof tarSchema>;

export const TreatmentAdministrationRecord: React.FC = () => {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const patientId = searchParams.get('patientId') || DUMMY_PATIENT_ID;
  const [notification, setNotification] = useState<{ type: NotificationType, message: string } | null>(null);

  const { register, handleSubmit, setValue, watch, control, reset, getValues, formState: { errors, isSubmitting } } = useForm<TARFormValues>({
    resolver: zodResolver(tarSchema),
    defaultValues: {
      month: new Date().toLocaleString('default', { month: 'long' }),
      year: new Date().getFullYear().toString(),
      treatments: [{ description: '', frequency: '', times: '', administrations: {} }],
      staffSignatures: [{ initials: '', name: '' }]
    }
  });

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

  const { fields: treatFields, append: appendTreat, remove: removeTreat } = useFieldArray({
    control,
    name: 'treatments'
  });

  useEffect(() => {
    if (patientId && patientId !== DUMMY_PATIENT_ID) {
      const fetchPatient = async () => {
        const { data, error } = await supabase
          .from('patients')
          .select('first_name, last_name, dob')
          .eq('id', patientId)
          .single();
        
        if (data && !error) {
          setValue('patient.name', `${data.first_name} ${data.last_name}`);
          setValue('patient.dob', data.dob);
        }
      };
      fetchPatient();
    }
  }, [patientId, setValue]);

  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handlePrint = async () => {
    console.log('Treatment Administration Record: Starting PDF generation...');
    try {
      setIsGeneratingPDF(true);
      const formData = getValues();
      console.log('Treatment Administration Record: Form data for PDF:', formData);
      await generateFormPDF(FORM_NAME, formData);
      console.log('Treatment Administration Record: PDF generation successful.');
    } catch (error) {
      console.error('Treatment Administration Record: PDF error:', error);
      setNotification({ type: 'error', message: 'Failed to generate PDF. Please try again.' });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const submitForm = async (data: TARFormValues, status: 'draft' | 'submitted') => {
    if (!profile) {
      setNotification({ type: 'error', message: 'You must be logged in to submit forms.' });
      return;
    }

    console.log(`${FORM_NAME}: Starting submission (status: ${status})...`);
    try {
      if (status === 'draft') setIsSavingDraft(true);
      
      // 1. Get Form ID if not already fetched
      let currentFormId = formId;
      if (!currentFormId) {
        console.log(`${FORM_NAME}: Form ID missing, fetching for "${FORM_NAME}"...`);
        currentFormId = (await withTimeout(getFormIdByName(FORM_NAME))) as any;
        if (!currentFormId) {
          throw new Error(`The "${FORM_NAME}" form is missing from the database. Please go to the Dashboard to run the Database Setup.`);
        }
        setFormId(currentFormId);
      }
      
      console.log(`${FORM_NAME}: Using Form ID: ${currentFormId}, Patient ID: ${patientId}`);

      // 1.5 Verify patient exists
      const { data: patientExists, error: patientCheckError } = (await withTimeout(supabase
        .from('patients')
        .select('id')
        .eq('id', patientId)
        .maybeSingle())) as any;
      
      if (patientCheckError) {
        console.error(`${FORM_NAME}: Patient check error:`, patientCheckError);
      }
      
      if (!patientExists) {
        throw new Error(`The patient (ID: ${patientId}) does not exist in the database. Please go to the Dashboard and click "Setup Now" to create the test patient.`);
      }

      // 2. Insert or Update form_responses
      let responseData: any = null;

      if (editId) {
        const { data: upData, error: upErr } = await supabase
          .from('form_responses')
          .update({ data: data, status: status, updated_at: new Date().toISOString() })
          .eq('id', editId)
          .select('id')
          .maybeSingle();
        if (upErr) { console.error(`${FORM_NAME}: Update error:`, upErr); throw upErr; }
        responseData = upData;
      } else {
        const { data: inData, error: inErr } = await supabase
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
        if (inErr) { console.error(`${FORM_NAME}: Insert error:`, inErr); throw inErr; }
        responseData = inData;
      }

      const responseId = responseData?.id ?? editId ?? null;

      console.log(`${FORM_NAME}: Response submitted, ID:`, responseId);
      
      setNotification({ 
        type: 'success', 
        message: status === 'draft' ? 'Draft saved successfully!' : 'TAR submitted successfully!' 
      });
      if (status === 'submitted') reset();
    } catch (error: any) {
      console.error(`${FORM_NAME}: Caught error during submission:`, error);
      setNotification({ type: 'error', message: `Error: ${error.message}` });
    } finally {
      setIsSavingDraft(false);
      console.log(`${FORM_NAME}: Submission process finished.`);
    }
  };

  const onSubmit = (data: TARFormValues) => submitForm(data, 'submitted');

  const daysInMonth = 31;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <Link to="/clinical-forms" className="flex items-center gap-2 text-zinc-500 hover:text-partners-blue-dark transition-colors mb-6 group no-print">
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-sm font-medium">Back to Forms</span>
      </Link>
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Logo showText size={48} />
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-partners-blue-dark flex items-center gap-2">
              <Activity className="text-partners-green shrink-0" />
              Treatment Administration Record (TAR)
            </h2>
            <p className="text-sm md:text-base text-partners-gray">Monthly tracking of non-medication treatments and vitals.</p>
          </div>
        </div>
        <div className="flex flex-row items-center justify-end gap-3 no-print w-full md:w-auto mt-auto">
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
            disabled={isSubmitting || isSavingDraft}
            className="h-10 px-4 rounded-xl shadow-md bg-partners-blue-dark hover:bg-partners-blue transition-all active:scale-95"
          >
            <Send className="w-4 h-4 mr-2" />
            {isSubmitting ? 'Submitting...' : 'Submit Form'}
          </Button>
        </div>
      </div>

      <PrintPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        template={TAR_Template}
        data={getValues()}
        title="Treatment Administration Record"
        filename={`TAR_${getValues().patient?.name?.replace(/\s+/g, '_')}_${getValues().month}_${getValues().year}.pdf`}
      />

      <form className="space-y-8 bg-white p-4 sm:p-8 rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        {Object.keys(errors).length > 0 && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm animate-in fade-in slide-in-from-top-4 duration-300">
            <p className="font-bold mb-1">Please correct the following errors before submitting:</p>
            <ul className="list-disc list-inside">
              {Object.entries(errors).map(([key, error]: [string, any]) => (
                <li key={key}>{error.message || `Error in ${key}`}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b pb-2">
              <User size={20} />
              <h3>Patient Info</h3>
            </div>
            <div className="space-y-2">
              <input {...register('patient.name')} placeholder="Patient Name *" className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b pb-2">
              <Calendar size={20} />
              <h3>Period</h3>
            </div>
            <div className="flex gap-4">
              <input {...register('month')} placeholder="Month *" className="flex-1 px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
              <input type="number" {...register('year')} placeholder="Year *" className="w-24 px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
          </div>
        </div>

        {/* TAR Table */}
        <div className="w-full">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
            <h3 className="font-bold text-zinc-900 flex items-center gap-2">
              <Clock size={20} />
              Treatment Log
            </h3>
            <Button type="button" variant="secondary" size="sm" onClick={() => appendTreat({ description: '', frequency: '', times: '', administrations: {} })}>
              <Plus className="w-4 h-4 mr-2" />
              Add Treatment
            </Button>
          </div>
          
          <div className="border border-zinc-200 rounded-2xl overflow-hidden">
            <div className="w-full overflow-x-auto md:overflow-x-visible">
              <table className="w-full text-[9px] border-collapse table-fixed">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200">
                    <th className="p-0.5 border-r border-zinc-200 w-6 text-center">#</th>
                    <th className="p-1 border-r border-zinc-200 w-32 text-left">Treatment Description / Frequency</th>
                    <th className="p-1 border-r border-zinc-200 w-10 text-center">Time</th>
                    {Array.from({ length: daysInMonth }).map((_, i) => (
                      <th key={i} className="p-0 border-r border-zinc-200 text-center w-5">{i + 1}</th>
                    ))}
                    <th className="p-1 w-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {treatFields.map((field, index) => (
                    <tr key={field.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="p-0.5 border-r border-zinc-200 text-center font-bold text-zinc-400">
                        {index + 1}
                      </td>
                      <td className="p-1 border-r border-zinc-200">
                        <div className="space-y-0.5">
                          <input {...register(`treatments.${index}.description`)} placeholder="Treatment Description" className="w-full bg-transparent font-bold outline-none truncate" />
                          <input {...register(`treatments.${index}.frequency`)} placeholder="Frequency" className="w-full bg-transparent text-[7px] text-zinc-500 outline-none" />
                        </div>
                      </td>
                      <td className="p-1 border-r border-zinc-200">
                        <input {...register(`treatments.${index}.times`)} placeholder="09:00" className="w-full bg-transparent text-center outline-none font-medium" />
                      </td>
                      {Array.from({ length: daysInMonth }).map((_, i) => (
                        <td key={i} className="p-0 border-r border-zinc-200 h-7">
                          <input 
                            {...register(`treatments.${index}.administrations.${i + 1}`)} 
                            className="w-full h-full text-center bg-transparent outline-none focus:bg-partners-blue/5 uppercase"
                            maxLength={2}
                          />
                        </td>
                      ))}
                      <td className="p-0.5 text-center">
                        <button type="button" onClick={() => removeTreat(index)} className="text-red-400 hover:text-red-600">
                          <Trash2 size={10} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Staff Initials */}
        <section className="pt-8 border-t border-zinc-200">
          <h3 className="font-bold text-zinc-900 mb-4">Staff Initials</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm flex flex-col sm:flex-row gap-4 hover:border-partners-blue/30 transition-all">
                <div className="flex-1 space-y-1.5">
                  <label className="text-[10px] uppercase text-zinc-500 font-bold ml-1 tracking-wider">Initials</label>
                  <input 
                    {...register(`staffSignatures.${i}.initials`)} 
                    placeholder="Initials" 
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-zinc-100 focus:border-partners-blue focus:ring-4 focus:ring-partners-blue/10 outline-none bg-zinc-50/50 transition-all font-bold text-center uppercase placeholder:font-normal placeholder:normal-case" 
                  />
                </div>
                <div className="flex-[3] space-y-1.5">
                  <label className="text-[10px] uppercase text-zinc-500 font-bold ml-1 tracking-wider">Full Name & Title</label>
                  <input 
                    {...register(`staffSignatures.${i}.name`)} 
                    placeholder="Full Name & Title" 
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-zinc-100 focus:border-partners-blue focus:ring-4 focus:ring-partners-blue/10 outline-none bg-zinc-50/50 transition-all font-medium placeholder:font-normal" 
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
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