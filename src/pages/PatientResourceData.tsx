import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams, Link } from 'react-router-dom';
import * as z from 'zod';
import { Button } from '../components/Button';
import { UserRound, Save, Send, Users, Phone, Shield, HeartPulse, ArrowLeft, Loader2, FileText } from 'lucide-react';
import { Logo } from '../components/Logo';
import { Notification, NotificationType } from '../components/Notification';
import { supabase, getFormIdByName, withTimeout } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { generateFormPDF } from '../services/pdfService';
import { ConfirmationModal } from '../components/ConfirmationModal';

const DUMMY_PATIENT_ID = '00000000-0000-0000-0000-000000000000';
const FORM_NAME = 'Patient Resource Data';

const resourceSchema = z.object({
  patient: z.object({
    name: z.string().min(1, 'Required'),
    street: z.string().optional(),
    apt: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    gender: z.enum(['Male', 'Female']).optional(),
    mrNumber: z.string().optional(),
    admissionDate: z.string().optional(),
    phone: z.string().optional(),
  }),
  specialInstructions: z.string().optional(),
  demographics: z.object({
    dob: z.string().optional(),
    primaryLanguage: z.string().optional(),
    religion: z.string().optional(),
    maritalStatus: z.enum(['S', 'M', 'D', 'O']).optional(),
    raceEthnicity: z.array(z.string()),
    raceOther: z.string().optional(),
  }),
  emergencyContact: z.object({
    name: z.string().optional(),
    relationship: z.string().optional(),
    street: z.string().optional(),
    apt: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    telephoneHome: z.string().optional(),
    telephoneBusiness: z.string().optional(),
  }),
  resources: z.record(z.string(), z.string()),
  insurance: z.object({
    medicareNumber: z.string().optional(),
    medicaidNumber: z.string().optional(),
    other: z.string().optional(),
  }),
});

type ResourceFormValues = z.infer<typeof resourceSchema>;

const RESOURCE_FIELDS = [
  'Primary MD',
  'Clinical Contact Person',
  'Hospital of Preference',
  'Social Worker',
  'Pharmacy Name',
  'Home Care/Case Manager',
  'Meals on Wheels',
  'Transportation',
  'Adult Day Care',
  'Laboratory',
  'DME Company',
  'Homemaker Name',
  'Caregiver Support System'
];

export const PatientResourceData: React.FC = () => {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const patientId = searchParams.get('patientId') || DUMMY_PATIENT_ID;
  const editId = searchParams.get('id');
  const [notification, setNotification] = useState<{ type: NotificationType, message: string } | null>(null);

  const { register, handleSubmit, setValue, getValues, watch, reset, formState: { errors, isSubmitting } } = useForm<ResourceFormValues>({
    resolver: zodResolver(resourceSchema),
    defaultValues: {
      demographics: { raceEthnicity: [] },
      resources: RESOURCE_FIELDS.reduce((acc, field) => ({ ...acc, [field]: '' }), {}),
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

  // Load patient info + saved form data (latest draft or specific ?id= submission)
  useEffect(() => {
    if (!patientId || patientId === DUMMY_PATIENT_ID) return;

    const loadData = async () => {
      // 1. Always populate patient fields from patient record
      const { data: patient } = await supabase
        .from('patients')
        .select('first_name, last_name, dob, gender, phone, street, apt, city, state, zip, insurance_id')
        .eq('id', patientId)
        .single();

      if (patient) {
        setValue('patient.name', `${patient.first_name} ${patient.last_name}`);
        setValue('patient.street', patient.street || '');
        setValue('patient.apt', patient.apt || '');
        setValue('patient.city', patient.city || '');
        setValue('patient.state', patient.state || '');
        setValue('patient.zip', patient.zip || '');
        setValue('patient.phone', patient.phone || '');
        setValue('patient.gender', patient.gender === 'female' ? 'Female' : 'Male');
        setValue('demographics.dob', patient.dob);
        setValue('insurance.medicaidNumber', patient.insurance_id || '');
      }

      // 2. If ?id= is present, load that specific saved submission and override
      if (editId) {
        const { data: saved } = await supabase
          .from('form_responses')
          .select('*')
          .eq('id', editId)
          .maybeSingle();
        if (saved?.data) { reset(saved.data); return; }
      }

      // 3. Otherwise auto-load the latest saved response for this patient+form
      if (formId) {
        const { data: latest } = await supabase
          .from('form_responses')
          .select('*')
          .eq('patient_id', patientId)
          .eq('form_id', formId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latest?.data) reset(latest.data);
      }
    };

    loadData();
  }, [patientId, formId, editId]);

  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const handlePrint = async () => {
    console.log('Patient Resource Data: Starting PDF generation...');
    try {
      setIsGeneratingPDF(true);
      const formData = getValues();
      console.log('Patient Resource Data: Form data for PDF:', formData);
      await generateFormPDF(FORM_NAME, formData);
      console.log('Patient Resource Data: PDF generation successful.');
    } catch (error) {
      console.error('Patient Resource Data: PDF error:', error);
      setNotification({ type: 'error', message: 'Failed to generate PDF. Please try again.' });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const submitForm = async (data: ResourceFormValues, status: 'draft' | 'submitted') => {
    if (!profile) {
      setNotification({ type: 'error', message: 'You must be logged in to submit forms.' });
      return;
    }

    console.log(`Patient Resource Data: Starting submission (status: ${status})...`);
    try {
      if (status === 'draft') setIsSavingDraft(true);
      
      // 1. Get Form ID if not already fetched
      let currentFormId = formId;
      if (!currentFormId) {
        console.log(`Patient Resource Data: Form ID missing, fetching for "${FORM_NAME}"...`);
        currentFormId = (await withTimeout(getFormIdByName(FORM_NAME))) as any;
        if (!currentFormId) {
          throw new Error(`The "${FORM_NAME}" form is missing from the database. Please go to the Dashboard to run the Database Setup.`);
        }
        setFormId(currentFormId);
      }
      
      console.log(`Patient Resource Data: Using Form ID: ${currentFormId}, Patient ID: ${patientId}`);

      // 2. Insert or Update form_responses
      let responseError: any = null;

      if (editId) {
        const { error: upErr } = await supabase
          .from('form_responses')
          .update({ data: data, status: status, updated_at: new Date().toISOString() })
          .eq('id', editId);
        responseError = upErr;
      } else {
        const { error: inErr } = await supabase
          .from('form_responses')
          .insert([{
            form_id: currentFormId,
            patient_id: patientId,
            staff_id: profile.id,
            data: data,
            status: status
          }]);
        responseError = inErr;
      }
      
      if (responseError) {
        console.error('Patient Resource Data: Response error:', responseError);
        throw responseError;
      }
      
      setNotification({ 
        type: 'success', 
        message: status === 'draft' ? 'Draft saved successfully!' : 'Patient Resource Data submitted successfully!' 
      });
      if (status === 'submitted') reset();
    } catch (error: any) {
      console.error('Patient Resource Data: Caught error during submission:', error);
      setNotification({ type: 'error', message: `Error submitting form: ${error.message || 'Please try again.'}` });
    } finally {
      setIsSavingDraft(false);
      console.log('Patient Resource Data: Submission process finished.');
    }
  };

  const onSubmit = (data: ResourceFormValues) => submitForm(data, 'submitted');

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-8">
      <Link to="/clinical-forms" className="flex items-center gap-2 text-zinc-500 hover:text-partners-blue-dark transition-colors mb-6 group no-print">
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-sm font-medium">Back to Forms</span>
      </Link>
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Logo showText size={48} />
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-partners-blue-dark flex items-center gap-2 whitespace-nowrap">
              <UserRound className="text-partners-green shrink-0" />
              Patient Resource Data Form
            </h2>
            <p className="text-sm md:text-base text-partners-gray">Demographic information and health/community resources.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 no-print w-full">
          <Button 
            variant="secondary" 
            type="button" 
            onClick={handlePrint}
            disabled={isSubmitting || isSavingDraft || isGeneratingPDF}
            className="h-11 px-4 md:px-6 rounded-xl shadow-sm flex-1 md:flex-none"
          >
            {isGeneratingPDF ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            {isGeneratingPDF ? 'Generating...' : 'Download PDF'}
          </Button>
          <Button 
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting || isSavingDraft || isGeneratingPDF}
            className="h-11 px-6 md:px-8 rounded-xl shadow-md flex-1 md:flex-none"
          >
            <Send className="w-4 h-4 mr-2" />
            {isSubmitting ? 'Submitting...' : 'Submit Form'}
          </Button>
        </div>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-8 bg-white p-4 sm:p-8 rounded-2xl border border-zinc-200 shadow-sm overflow-hidden"
      >
        {/* Patient Info */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Patient Name</label>
              <input {...register('patient.name')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Address</label>
              <div className="grid grid-cols-1 gap-2">
                <input {...register('patient.street')} placeholder="Street" className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input {...register('patient.apt')} placeholder="Apt/Suite" className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
                  <input {...register('patient.city')} placeholder="City" className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input {...register('patient.state')} placeholder="State" className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
                  <input {...register('patient.zip')} placeholder="Zip" className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" value="Male" {...register('patient.gender')} className="w-4 h-4 text-partners-blue-dark" />
                <span className="text-sm">Male</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" value="Female" {...register('patient.gender')} className="w-4 h-4 text-partners-blue-dark" />
                <span className="text-sm">Female</span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">M.R.#</label>
                <input {...register('patient.mrNumber')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Admission Date</label>
                <input type="date" {...register('patient.admissionDate')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
              </div>
              <div className="space-y-1 col-span-full">
                <label className="text-sm font-medium text-zinc-700">Phone</label>
                <input {...register('patient.phone')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <label className="text-sm font-medium text-zinc-700">Directions/Special Instructions:</label>
          <textarea {...register('specialInstructions')} rows={3} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
        </section>

        {/* Demographics */}
        <section className="space-y-6 bg-zinc-50 p-3 sm:p-6 rounded-3xl border border-zinc-100">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b pb-2">
            <Users size={20} />
            <h3 className="uppercase tracking-widest text-sm">Demographic Information</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Date of Birth</label>
                <input type="date" {...register('demographics.dob')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Primary Language</label>
                <input {...register('demographics.primaryLanguage')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Religion</label>
                <input {...register('demographics.religion')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">Marital Status</label>
                <div className="flex gap-4">
                  {['S', 'M', 'D', 'O'].map(status => (
                    <label key={status} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" value={status} {...register('demographics.maritalStatus')} className="w-4 h-4 text-partners-blue-dark" />
                      <span className="text-sm">{status}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">Race/Ethnicity</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {['White', 'Black', 'Indian', 'Asian', 'Hispanic', 'Russian', 'Other'].map(race => (
                    <label key={race} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" value={race} {...register('demographics.raceEthnicity')} className="w-4 h-4 rounded border-zinc-300" />
                      <span className="text-xs">{race}</span>
                    </label>
                  ))}
                </div>
                {watch('demographics.raceEthnicity')?.includes('Other') && (
                  <input {...register('demographics.raceOther')} className="w-full px-3 py-1 mt-2 border-b border-zinc-200 outline-none text-sm" placeholder="Specify other" />
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Emergency Contact */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b pb-2">
            <Phone size={20} />
            <h3 className="uppercase tracking-widest text-sm">Emergency Contact</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Name</label>
              <input {...register('emergencyContact.name')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Relationship</label>
              <input {...register('emergencyContact.relationship')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
            </div>
            <div className="space-y-1 col-span-full">
              <label className="text-sm font-medium text-zinc-700">Address</label>
              <div className="grid grid-cols-1 gap-2">
                <input {...register('emergencyContact.street')} placeholder="Street" className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input {...register('emergencyContact.apt')} placeholder="Apt/Suite" className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
                  <input {...register('emergencyContact.city')} placeholder="City" className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input {...register('emergencyContact.state')} placeholder="State" className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
                  <input {...register('emergencyContact.zip')} placeholder="Zip" className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Telephone: Home</label>
              <input {...register('emergencyContact.telephoneHome')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Business</label>
              <input {...register('emergencyContact.telephoneBusiness')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
            </div>
          </div>
        </section>

        {/* Health and Community Resources */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b pb-2">
            <HeartPulse size={20} />
            <h3 className="uppercase tracking-widest text-sm">Health and Community Resources</h3>
          </div>
          <div className="overflow-hidden rounded-2xl border border-zinc-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th className="px-4 py-2 text-xs font-bold text-zinc-500 uppercase">Resources</th>
                  <th className="px-4 py-2 text-xs font-bold text-zinc-500 uppercase">Name / Agency / Telephone Number</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {RESOURCE_FIELDS.map(field => (
                  <tr key={field}>
                    <td className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-50/50 w-1/3">{field}</td>
                    <td className="px-4 py-2">
                      <input {...register(`resources.${field}`)} className="w-full px-3 py-1 text-sm outline-none bg-transparent focus:bg-white transition-colors" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Insurance */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b pb-2">
            <Shield size={20} />
            <h3 className="uppercase tracking-widest text-sm">Insurance Information</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Medicare Number</label>
              <input {...register('insurance.medicareNumber')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Medicaid Number</label>
              <input {...register('insurance.medicaidNumber')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Other</label>
              <input {...register('insurance.other')} className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
            </div>
          </div>
        </section>
        <div className="flex justify-end pt-2 no-print">
          <Button
            type="submit"
            disabled={isSubmitting || isSavingDraft || isGeneratingPDF}
            className="h-11 px-6 md:px-8 rounded-xl shadow-md"
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
