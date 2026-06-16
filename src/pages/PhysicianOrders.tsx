import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams, Link } from 'react-router-dom';
import * as z from 'zod';
import { Button } from '../components/Button';
import { Notification, NotificationType } from '../components/Notification';
import { generateFormPDF } from '../services/pdfService';
import { FileText, Save, Send, Plus, Trash2, User, Stethoscope, Pill, ArrowLeft, Loader2 } from 'lucide-react';
import { SignaturePad } from '../components/SignaturePad';
import { Logo } from '../components/Logo';
import { supabase, getFormIdByName, withTimeout } from '../services/supabase';
import { useAuth } from '../context/AuthContext';

const DUMMY_PATIENT_ID = '00000000-0000-0000-0000-000000000000';
const FORM_NAME = 'Physician Orders';

const ordersSchema = z.object({
  patient: z.object({
    name: z.string().min(1, 'Required'),
    dob: z.string().optional(),
    mrNumber: z.string().optional(),
    admissionDate: z.string().optional(),
  }),
  diagnosis: z.object({
    primary: z.string().optional(),
    secondary: z.string().optional(),
  }),
  medications: z.array(z.object({
    name: z.string().min(1, 'Required'),
    dose: z.string().optional(),
    frequency: z.string().optional(),
    route: z.string().optional(),
  })),
  orders: z.string().optional(),
  physician: z.object({
    name: z.string().min(1, 'Required'),
    npi: z.string().optional(),
    phone: z.string().optional(),
    signature: z.string().min(1, 'Signature required'),
    date: z.string().min(1, 'Required'),
  }),
});

type OrdersFormValues = z.infer<typeof ordersSchema>;

export const PhysicianOrders: React.FC = () => {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const patientId = searchParams.get('patientId') || DUMMY_PATIENT_ID;
  const editId = searchParams.get('id');
  const [notification, setNotification] = useState<{ type: NotificationType, message: string } | null>(null);

  const { register, handleSubmit, setValue, watch, control, reset, getValues, formState: { errors, isSubmitting } } = useForm<OrdersFormValues>({
    resolver: zodResolver(ordersSchema),
    defaultValues: {
      medications: [{ name: '', dose: '', frequency: '', route: '' }],
      physician: { date: new Date().toISOString().split('T')[0] }
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'medications'
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
            .maybeSingle();
          if (data && !error) reset(data.data);
        } catch (err) {
          console.error('PhysicianOrders: Error fetching submission:', err);
        }
      };
      fetchSubmission();
    }
  }, [editId, reset]);

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

  const submitForm = async (data: OrdersFormValues, status: 'draft' | 'submitted') => {
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

      // 3. Insert signature if present
      if (data.physician.signature) {
        console.log(`${FORM_NAME}: Inserting signature...`);
        const { error: sigError } = await supabase
          .from('signatures')
          .insert([{
            parent_id: responseId,
            parent_type: 'form_response',
            signer_id: profile.id,
            signature_data: data.physician.signature
          }]);
        
        if (sigError) {
          console.error(`${FORM_NAME}: Signature insertion error:`, sigError);
          throw sigError;
        }
        console.log(`${FORM_NAME}: Signature inserted successfully`);
      }
      
      setNotification({ 
        type: 'success', 
        message: status === 'draft' ? 'Draft saved successfully!' : 'Physician Orders submitted successfully!' 
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

  const onSubmit = async (data: OrdersFormValues) => await submitForm(data, 'submitted');
  const onSaveDraft = async () => {
    const data = watch();
    await submitForm(data, 'draft');
  };

  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const handlePrint = async () => {
    console.log('Physician Orders: Starting PDF generation...');
    try {
      setIsGeneratingPDF(true);
      const formData = getValues();
      console.log('Physician Orders: Form data for PDF:', formData);
      await generateFormPDF(FORM_NAME, formData);
      console.log('Physician Orders: PDF generation successful.');
    } catch (error) {
      console.error('Physician Orders: PDF error:', error);
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
              Physician Orders / Plan of Care
            </h2>
            <p className="text-sm md:text-base text-partners-gray">Document physician orders and medical plan of care.</p>
          </div>
        </div>
        <div className="flex flex-row items-center justify-end gap-3 no-print">
          <Button 
            variant="secondary" 
            type="button" 
            onClick={handlePrint}
            disabled={isSubmitting || isSavingDraft || isGeneratingPDF}
            className="h-10 px-4 rounded-xl shadow-sm"
          >
            {isGeneratingPDF ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            {isGeneratingPDF ? 'Generating...' : 'Download PDF'}
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

      <form 
        className="space-y-8 bg-white p-4 sm:p-8 rounded-2xl border border-zinc-200 shadow-sm overflow-hidden"
      >
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
        {/* Patient Info */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b pb-2">
              <User size={20} />
              <h3>Patient Information</h3>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Patient Name</label>
                <input {...register('patient.name')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">Date of Birth</label>
                  <input type="date" {...register('patient.dob')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">M.R.#</label>
                  <input {...register('patient.mrNumber')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b pb-2">
              <Stethoscope size={20} />
              <h3>Diagnosis</h3>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Primary Diagnosis</label>
                <input {...register('diagnosis.primary')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Secondary Diagnosis</label>
                <input {...register('diagnosis.secondary')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
              </div>
            </div>
          </div>
        </section>

        {/* Medications */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2 text-partners-blue-dark font-bold">
              <Pill size={20} />
              <h3>Medications</h3>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => append({ name: '', dose: '', frequency: '', route: '' })}>
              <Plus className="w-4 h-4 mr-2" />
              Add Medication
            </Button>
          </div>
          <div className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                <div className="md:col-span-2 space-y-1">
                  <label className="text-xs font-medium text-zinc-500">Medication Name</label>
                  <input {...register(`medications.${index}.name`)} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-500">Dose</label>
                  <input {...register(`medications.${index}.dose`)} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-500">Frequency</label>
                  <input {...register(`medications.${index}.frequency`)} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-sm" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs font-medium text-zinc-500">Route</label>
                    <input {...register(`medications.${index}.route`)} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-sm" />
                  </div>
                  <button type="button" onClick={() => remove(index)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Orders / Plan of Care */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b pb-2">
            <FileText size={20} />
            <h3>Orders / Plan of Care</h3>
          </div>
          <textarea 
            {...register('orders')} 
            rows={8} 
            placeholder="Enter detailed physician orders and plan of care..."
            className="w-full px-4 py-3 rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue/20 outline-none transition-all"
          />
        </section>

        {/* Physician Signature */}
        <section className="space-y-6 pt-8 border-t border-zinc-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <SignaturePad 
                label="Physician Signature" 
                onSave={(sig) => setValue('physician.signature', sig, { shouldValidate: true })}
                initialValue={watch('physician.signature')}
              />
              {errors.physician?.signature && <p className="text-xs text-red-500">{errors.physician.signature.message}</p>}
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Physician Name</label>
                <input {...register('physician.name')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">NPI #</label>
                  <input {...register('physician.npi')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">Phone</label>
                  <input {...register('physician.phone')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Date</label>
                <input type="date" {...register('physician.date')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
              </div>
            </div>
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