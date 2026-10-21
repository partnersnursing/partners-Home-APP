import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { FileUpload } from '../components/FileUpload';
import { 
  User, Calendar, Phone, Mail, MapPin, Shield, ArrowLeft,
  FileText, Activity, ClipboardList, Clock, ChevronRight,
  Edit2, Printer, AlertCircle, CheckCircle2, ClipboardCheck,
  Stethoscope, Pill, FileSignature, UserPlus, UserMinus,
  Building2,
} from 'lucide-react';
import { Button } from '../components/Button';
import { parseLocalDate } from '../utils/dates';
import { Logo } from '../components/Logo';
import { format, addYears, addMonths, isAfter, isBefore, subDays, addDays } from 'date-fns';
import { generateFormPDF } from '../services/pdfService';
import { PrintPreviewModal } from '../components/PrintPreviewModal';
import { PatientSummaryTemplate } from '../components/PDFTemplates/PatientSummaryTemplate';

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  dob: string;
  gender: string;
  phone: string | null;
  email: string | null;
  street: string | null;
  apt: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  insurance_id: string | null;
  ssn_encrypted: string | null;
  status: string;
  mloa_days: number;
  nmloa_days: number;
  last_annual_physical: string | null;
  last_semi_annual_report: string | null;
  last_monthly_visit: string | null;
  preferred_name: string | null;
  race: string | null;
  religion: string | null;
  marital_status: string | null;
  primary_language: string | null;
  height: string | null;
  weight: string | null;
  is_responsible_for_self: boolean;
  mds_date: string | null;
  hospital_of_choice: string | null;
  start_of_service: string | null;
  occupation: string | null;
  mothers_maiden_name: string | null;
  primary_payer: string | null;
  primary_payer_id: string | null;
  medicare_id: string | null;
  medicaid_id: string | null;
  other_insurance: string | null;
  other_insurance_id: string | null;
  pharmacy_name: string | null;
  pharmacy_phone: string | null;
  pharmacy_street: string | null;
  pharmacy_apt: string | null;
  pharmacy_city: string | null;
  pharmacy_state: string | null;
  pharmacy_zip: string | null;
  transportation_company_name: string | null;
  transportation_company_phone: string | null;
  transportation_company_street: string | null;
  transportation_company_apt: string | null;
  transportation_company_city: string | null;
  transportation_company_state: string | null;
  transportation_company_zip: string | null;
  adult_day_health_name: string | null;
  adult_day_health_phone: string | null;
  adult_day_health_street: string | null;
  adult_day_health_apt: string | null;
  adult_day_health_city: string | null;
  adult_day_health_state: string | null;
  adult_day_health_zip: string | null;
  living_will: string | null;
  full_code: string | null;
  organ_donation: string | null;
  autopsy_request: string | null;
  hospice: string | null;
  dnr: string | null;
  dni: string | null;
  dnh: string | null;
  feeding_restrictions: string | null;
  medication_restrictions: string | null;
  other_treatment_restrictions: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_address: {
    street?: string;
    apt?: string;
    city?: string;
    state?: string;
    zip?: string;
  } | null;
  pcp_id: string | null;
  other_provider_ids: string | string[] | null;
  diagnoses: { disease: string; icd10: string; }[] | null;
  medications: { medicine: string; dosage: string; number?: string; route?: string; schedule: string; }[] | null;
  created_at: string;
}

interface MedicalProvider {
  id: string;
  first_name: string;
  last_name: string;
  facility_name: string;
  street: string | null;
  apt: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
}

interface Visit {
  id: string;
  scheduled_at: string;
  status: string;
  type: string;
}

// ── FIX: added storage_path to SubmittedForm interface ───────────────────────
interface SubmittedForm {
  id: string;
  created_at: string;
  status: string;
  form_id: string;
  storage_path: string | null;
  data?: { form_name?: string } | null;
  forms: { name: string } | null;
}

const ProviderDetailCard: React.FC<{ provider: MedicalProvider }> = ({ provider }) => (
  <div className="p-4 rounded-2xl bg-partners-blue-dark/5 border border-partners-blue-dark/15 space-y-2">
    <div className="flex items-center gap-2">
      <div className="w-9 h-9 rounded-xl bg-partners-blue-dark/10 text-partners-blue-dark flex items-center justify-center shrink-0">
        <Stethoscope size={15} />
      </div>
      <div>
        <p className="text-sm font-bold text-zinc-800">{provider.first_name} {provider.last_name}</p>
        <p className="text-xs text-partners-blue-dark font-medium flex items-center gap-1">
          <Building2 size={11} /> {provider.facility_name}
        </p>
      </div>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1">
      {provider.phone && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-600">
          <Phone size={12} className="text-zinc-400 shrink-0" /> {provider.phone}
        </div>
      )}
      {provider.fax && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-600">
          <span className="text-zinc-400 text-[10px] font-bold shrink-0">FAX</span> {provider.fax}
        </div>
      )}
      {provider.email && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-600 sm:col-span-2">
          <Mail size={12} className="text-zinc-400 shrink-0" /> {provider.email}
        </div>
      )}
      {(provider.street || provider.city) && (
        <div className="flex items-start gap-1.5 text-xs text-zinc-600 sm:col-span-2">
          <MapPin size={12} className="text-zinc-400 shrink-0 mt-0.5" />
          <span>
            {provider.street}{provider.apt ? `, ${provider.apt}` : ''}
            {(provider.street || provider.apt) && (provider.city || provider.state || provider.zip) ? ', ' : ''}
            {provider.city}{provider.city && (provider.state || provider.zip) ? ', ' : ''}{provider.state} {provider.zip}
          </span>
        </div>
      )}
    </div>
  </div>
);

const getAddressLines = (
  street?: string | null,
  apt?: string | null,
  city?: string | null,
  state?: string | null,
  zip?: string | null
) => [
  street,
  apt,
  [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
].filter(Boolean);

const ResourceContactCard: React.FC<{
  title: string;
  name?: string | null;
  phone?: string | null;
  addressLines: string[];
}> = ({ title, name, phone, addressLines }) => (
  <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100 space-y-3">
    <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{title}</p>
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Name</p>
        <p className="text-zinc-700 font-bold">{name || 'N/A'}</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Telephone</p>
        <p className="text-zinc-700">{phone || 'N/A'}</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Address</p>
        <div className="text-zinc-700 leading-relaxed">
          {addressLines.length > 0 ? addressLines.map((line, index) => <p key={index}>{line}</p>) : 'N/A'}
        </div>
      </div>
    </div>
  </div>
);

const ComplianceItem: React.FC<{ 
  title: string; 
  lastDate: string | null; 
  dueDate: Date | null;
  type: string;
}> = ({ title, lastDate, dueDate }) => {
  const today = new Date();
  const isOverdue = dueDate && isBefore(dueDate, today);
  const isDueSoon = dueDate && !isOverdue && isBefore(dueDate, addDays(today, 30));
  const isOverdueAlert = dueDate && isOverdue && isBefore(today, addDays(dueDate, 5));

  return (
    <div className={`p-4 rounded-2xl border transition-all ${
      isOverdue ? 'bg-red-50 border-red-100' : 
      isDueSoon ? 'bg-amber-50 border-amber-100' : 
      'bg-zinc-50 border-zinc-100'
    }`}>
      <div className="flex justify-between items-start mb-2">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{title}</p>
        {isOverdue ? (
          <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 uppercase">
            <AlertCircle size={12} /> Overdue
          </span>
        ) : isDueSoon ? (
          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 uppercase">
            <Clock size={12} /> Due Soon
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 uppercase">
            <CheckCircle2 size={12} /> Compliant
          </span>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-bold text-zinc-900">
          {lastDate ? format(parseLocalDate(lastDate)!, 'MMM d, yyyy') : 'Never'}
        </p>
        <p className="text-[10px] text-zinc-500">
          Next Due: {dueDate ? format(dueDate, 'MMM d, yyyy') : 'TBD'}
        </p>
      </div>
      {isOverdueAlert && (
        <div className="mt-3 p-2 bg-red-100/50 rounded-lg text-[10px] text-red-700 font-medium flex items-center gap-1 animate-pulse">
          <AlertCircle size={12} /> Critical: Action required immediately
        </div>
      )}
    </div>
  );
};

const FORM_ROUTES: Record<string, string> = {
  'GAFC Progress Note': '/progress-note',
  'GAFC Care Plan': '/care-plan',
  'Physician Summary (PSF-1)': '/physician-summary',
  'Request for Services (RFS-1)': '/request-for-services',
  'CIRF': '/cirf',
  'Patient Resource Data': '/patient-resource-data',
  'Physician Orders': '/physician-orders',
  'MDS Assessment': '/mds-assessment',
  'Nursing Assessment': '/nursing-assessment',
  'Medication Administration Record (MAR)': '/mar',
  'Treatment Administration Record (TAR)': '/tar',
  'Clinical Note': '/clinical-note-form',
  'Semi-Annual Health Status Report': '/semi-annual-health-status',
  'GAFC Aide Care Plan': '/gafc-aide-care-plan',
  'Medication List': '/medication-list',
  'Home Safety Inspection': '/home-safety-inspection',
  'Admission Assessment': '/admission-assessment',
  'Discharge Summary': '/discharge-summary',
};

const resolveSubmissionFormName = (submission: any) => {
  const linkedForm = Array.isArray(submission.forms) ? submission.forms[0] : submission.forms;
  if (linkedForm?.name) return linkedForm.name;
  if (submission.data?.form_name) return submission.data.form_name;
  if (submission.data?.dischargeReason || submission.data?.summary) return 'Discharge Summary';
  if (submission.data?.assessment) return 'Admission Assessment';
  if (submission.data?.bathroom && submission.data?.safetyEquipment) return 'Home Safety Inspection';
  return 'Unknown Form';
};

const formStatusStyle = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'submitted': return 'bg-emerald-100 text-emerald-700';
    case 'draft':     return 'bg-amber-100 text-amber-700';
    case 'reviewed':  return 'bg-blue-100 text-blue-700';
    case 'approved':  return 'bg-partners-blue-dark/10 text-partners-blue-dark';
    default:          return 'bg-zinc-100 text-zinc-600';
  }
};

export const PatientProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [submittedForms, setSubmittedForms] = useState<SubmittedForm[]>([]);
  const [formsLoading, setFormsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [medicalProviders, setMedicalProviders] = useState<MedicalProvider[]>([]);

  useEffect(() => {
    if (id) fetchPatientData();
    fetchMedicalProviders();
  }, [id]);

  const fetchMedicalProviders = async () => {
    try {
      const { data, error } = await supabase
        .from('medical_providers')
        .select('*')
        .order('last_name', { ascending: true });
      if (error) throw error;
      setMedicalProviders(data || []);
    } catch (e) {
      console.error('Error fetching medical providers:', e);
    }
  };

  const fetchPatientData = async () => {
    try {
      setLoading(true);
      const { data: patientData, error: patientError } = await supabase
        .from('patients').select('*').eq('id', id).single();
      if (patientError) throw patientError;
      setPatient(patientData);

      const { data: visitsData } = await supabase
        .from('visits').select('*').eq('patient_id', id)
        .order('scheduled_at', { ascending: false });
      setVisits(visitsData || []);

      setFormsLoading(true);
      // ── FIX: added storage_path to select so PDFFormViewer can load stored PDFs ──
      const { data: formsData, error: formsError } = await supabase
        .from('form_responses')
        .select('id, created_at, status, form_id, storage_path, data, forms(name)')
        .eq('patient_id', id)
        .order('created_at', { ascending: false });
      if (formsError) {
        console.error('Error fetching submitted forms:', formsError);
      }
      setSubmittedForms(((formsData || []).map((form: any) => ({
        ...form,
        forms: Array.isArray(form.forms) ? form.forms[0] ?? null : form.forms,
      })) as SubmittedForm[]));
      setFormsLoading(false);
    } catch (error) {
      console.error('Error fetching patient data:', error);
      navigate('/patients');
    } finally {
      setLoading(false);
    }
  };

  const resolvedPcp = patient?.pcp_id
    ? medicalProviders.find(p => p.id === patient.pcp_id) ?? null
    : null;

  const resolvedOtherProviders: MedicalProvider[] = (() => {
    if (!patient?.other_provider_ids) return [];
    const ids: string[] = Array.isArray(patient.other_provider_ids)
      ? patient.other_provider_ids
      : String(patient.other_provider_ids).split(',').map(s => s.trim()).filter(Boolean);
    return ids
      .map(pid => medicalProviders.find(p => p.id === pid))
      .filter((p): p is MedicalProvider => Boolean(p));
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-partners-blue-dark"></div>
      </div>
    );
  }

  if (!patient) return null;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <Link to="/patients" className="flex items-center gap-2 text-zinc-500 hover:text-partners-blue-dark transition-colors">
          <ArrowLeft size={20} />
          <span className="font-medium">Back to Patients</span>
        </Link>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" onClick={() => navigate(`/patients?edit=${patient.id}`)}>
            <Edit2 size={16} className="mr-2" /> Edit Profile
          </Button>
          <Button size="sm" onClick={() => setIsPreviewOpen(true)}>
            <Printer size={16} className="mr-2" /> Print Summary
          </Button>
        </div>
      </div>

      <PrintPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        template={PatientSummaryTemplate}
        data={{ patient, visits }}
        title="Patient Summary"
        filename={`Patient_Summary_${patient.last_name}_${patient.first_name}.pdf`}
      />

      {/* Header Card */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="bg-partners-blue-dark/5 p-4 sm:p-8 border-b border-zinc-100">
          <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
            <div className="w-24 h-24 rounded-3xl bg-partners-blue-dark text-white flex items-center justify-center text-2xl sm:text-4xl font-bold shadow-lg">
              {patient.first_name?.[0] || 'P'}{patient.last_name?.[0] || 'T'}
            </div>
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-4">
                <h1 className="text-xl sm:text-3xl font-bold text-zinc-900">{patient.last_name}, {patient.first_name}</h1>
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  patient.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'
                }`}>
                  {patient.status}
                </span>
              </div>
              <div className="flex flex-wrap gap-6 text-zinc-500">
                <div className="flex items-center gap-2">
                  <Calendar size={18} className="text-zinc-400" />
                  <span>DOB: {patient.dob ? format(parseLocalDate(patient.dob)!, 'MMMM d, yyyy') : 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User size={18} className="text-zinc-400" />
                  <span className="capitalize">{patient.gender}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield size={18} className="text-zinc-400" />
                  <span>ID: {patient.id.slice(0, 8)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-zinc-100">
          <div className="p-8 space-y-6">
            <h3 className="font-bold text-zinc-900 flex items-center gap-2">
              <Phone size={18} className="text-partners-blue-dark" /> Contact Information
            </h3>
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Phone</p>
                <p className="text-zinc-700">{patient.phone || 'Not provided'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Email</p>
                <p className="text-zinc-700">{patient.email || 'Not provided'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Address</p>
                <div className="text-zinc-700 leading-relaxed">
                  {patient.street ? (
                    <>
                      <p>{patient.street}</p>
                      {patient.apt && <p>{patient.apt}</p>}
                      <p>{patient.city}, {patient.state} {patient.zip}</p>
                    </>
                  ) : 'Not provided'}
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 space-y-6">
            <h3 className="font-bold text-zinc-900 flex items-center gap-2">
              <Activity size={18} className="text-partners-green" /> Insurance & Billing
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                ['Primary Payer', patient.primary_payer],
                ['Primary Payer ID Number', patient.primary_payer_id],
                ['Insurance ID', patient.insurance_id],
                ['Medicare ID', patient.medicare_id],
                ['Medicaid ID', patient.medicaid_id],
                ['Other Insurance', patient.other_insurance],
                ['Other Insurance ID', patient.other_insurance_id],
                ['SSN (Last 4)', `***-**-${patient.ssn_encrypted || '****'}`],
              ].map(([label, val]) => (
                <div key={label as string} className="space-y-1">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{label}</p>
                  <p className="text-zinc-700 break-words">{val || 'Not provided'}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="p-8 space-y-6">
            <h3 className="font-bold text-zinc-900 flex items-center gap-2">
              <Clock size={18} className="text-partners-blue-dark" /> Recent Activity
            </h3>
            <div className="space-y-4">
              {visits.length > 0 ? (
                <div className="space-y-3">
                  {visits.slice(0, 3).map((visit) => (
                    <div key={visit.id} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                      <div>
                        <p className="text-sm font-bold text-zinc-900">{visit.type}</p>
                        <p className="text-xs text-zinc-500">{visit.scheduled_at ? format(new Date(visit.scheduled_at), 'MMM d, yyyy') : 'N/A'}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        visit.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'
                      }`}>
                        {visit.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500 italic">No recent visits recorded.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Additional Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Demographics */}
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
            <h3 className="font-bold text-zinc-900 flex items-center gap-2">
              <User size={18} className="text-partners-blue-dark" /> Expanded Demographics
            </h3>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              ['Preferred Name', patient.preferred_name],
              ['Race', patient.race],
              ['Religion', patient.religion],
              ['Marital Status', patient.marital_status],
              ['Primary Language', patient.primary_language],
              ['Height / Weight', `${patient.height || 'N/A'} / ${patient.weight || 'N/A'}`],
              ['Responsible for Self', patient.is_responsible_for_self ? 'Yes' : 'No'],
              ['Occupation', patient.occupation],
            ].map(([label, val]) => (
              <div key={label as string} className="space-y-1">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{label}</p>
                <p className="text-zinc-700">{val || 'N/A'}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Census & Service */}
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
            <h3 className="font-bold text-zinc-900 flex items-center gap-2">
              <ClipboardList size={18} className="text-partners-green" /> Census & Service Details
            </h3>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              ['MDS Date', patient.mds_date ? format(parseLocalDate(patient.mds_date)!, 'MMM d, yyyy') : null],
              ['Hospital of Choice', patient.hospital_of_choice],
              ['Start of Service', patient.start_of_service ? format(parseLocalDate(patient.start_of_service)!, 'MMM d, yyyy') : null],
              ["Mother's Maiden Name", patient.mothers_maiden_name],
              ['Primary Payer', patient.primary_payer],
              ['Primary Payer ID Number', patient.primary_payer_id],
              ['Medicare ID', patient.medicare_id],
              ['Medicaid ID', patient.medicaid_id],
            ].map(([label, val]) => (
              <div key={label as string} className="space-y-1">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{label}</p>
                <p className="text-zinc-700">{val || 'N/A'}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Resource Contacts */}
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden lg:col-span-2">
          <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
            <h3 className="font-bold text-zinc-900 flex items-center gap-2">
              <Building2 size={18} className="text-partners-blue-dark" /> Resource Contacts
            </h3>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <ResourceContactCard
              title="Pharmacy"
              name={patient.pharmacy_name}
              phone={patient.pharmacy_phone}
              addressLines={getAddressLines(patient.pharmacy_street, patient.pharmacy_apt, patient.pharmacy_city, patient.pharmacy_state, patient.pharmacy_zip)}
            />
            <ResourceContactCard
              title="Transportation Company"
              name={patient.transportation_company_name}
              phone={patient.transportation_company_phone}
              addressLines={getAddressLines(
                patient.transportation_company_street,
                patient.transportation_company_apt,
                patient.transportation_company_city,
                patient.transportation_company_state,
                patient.transportation_company_zip
              )}
            />
            <ResourceContactCard
              title="Adult Day Health"
              name={patient.adult_day_health_name}
              phone={patient.adult_day_health_phone}
              addressLines={getAddressLines(
                patient.adult_day_health_street,
                patient.adult_day_health_apt,
                patient.adult_day_health_city,
                patient.adult_day_health_state,
                patient.adult_day_health_zip
              )}
            />
          </div>
        </div>

        {/* Advanced Directives */}
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
            <h3 className="font-bold text-zinc-900 flex items-center gap-2">
              <Shield size={18} className="text-partners-blue-dark" /> Advanced Directives
            </h3>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              ['Living Will', patient.living_will],
              ['Full Code', patient.full_code],
              ['DNR / DNI / DNH', `${patient.dnr || 'No'} / ${patient.dni || 'No'} / ${patient.dnh || 'No'}`],
              ['Organ Donation', patient.organ_donation],
              ['Hospice', patient.hospice],
            ].map(([label, val]) => (
              <div key={label as string} className="space-y-1">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{label}</p>
                <p className="text-zinc-700">{val || 'N/A'}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
            <h3 className="font-bold text-zinc-900 flex items-center gap-2">
              <Phone size={18} className="text-partners-green" /> Emergency Contact
            </h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-1">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Name</p>
                <p className="text-zinc-700 font-bold">{patient.emergency_contact_name || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Relationship</p>
                <p className="text-zinc-700">{patient.emergency_contact_relationship || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Phone</p>
                <p className="text-zinc-700">{patient.emergency_contact_phone || 'N/A'}</p>
              </div>
            </div>
            {patient.emergency_contact_address && (
              <div className="space-y-1">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Address</p>
                <p className="text-zinc-700">
                  {patient.emergency_contact_address.street}
                  {patient.emergency_contact_address.apt && `, ${patient.emergency_contact_address.apt}`}
                  <br />
                  {patient.emergency_contact_address.city}, {patient.emergency_contact_address.state} {patient.emergency_contact_address.zip}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Diagnoses & Medications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
            <h3 className="font-bold text-zinc-900 flex items-center gap-2">
              <Activity size={18} className="text-red-500" /> Diagnoses
            </h3>
          </div>
          <div className="p-6">
            {patient.diagnoses && patient.diagnoses.length > 0 ? (
              <div className="space-y-3">
                {patient.diagnoses.map((diag, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                    <span className="text-sm font-bold text-zinc-900">{diag.disease}</span>
                    <span className="text-xs font-mono bg-zinc-200 px-2 py-1 rounded text-zinc-600">{diag.icd10}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 italic">No diagnoses recorded.</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
            <h3 className="font-bold text-zinc-900 flex items-center gap-2">
              <ClipboardList size={18} className="text-partners-blue-dark" /> Medications
            </h3>
          </div>
          <div className="p-6">
            {patient.medications && patient.medications.length > 0 ? (
              <div className="space-y-3">
                {patient.medications.map((med, idx) => (
                  <div key={idx} className="p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-bold text-zinc-900">{med.medicine}</span>
                      <span className="text-xs font-medium text-partners-blue-dark">{med.dosage}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                      <span>{med.schedule}</span>
                      {med.number && <span>· Qty/Number: {med.number}</span>}
                      {med.route && <span>· Route: {med.route}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 italic">No medications recorded.</p>
            )}
          </div>
        </div>
      </div>

      {/* Healthcare Providers */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
          <h3 className="font-bold text-zinc-900 flex items-center gap-2">
            <Stethoscope size={18} className="text-partners-blue-dark" /> Healthcare Providers
          </h3>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-3">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Primary Care Physician (PCP)</p>
            {resolvedPcp ? (
              <ProviderDetailCard provider={resolvedPcp} />
            ) : (
              <p className="text-zinc-500 italic text-sm">N/A</p>
            )}
          </div>
          <div className="space-y-3">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Other Providers</p>
            {resolvedOtherProviders.length > 0 ? (
              <div className="space-y-3">
                {resolvedOtherProviders.map(p => (
                  <ProviderDetailCard key={p.id} provider={p} />
                ))}
              </div>
            ) : (
              <p className="text-zinc-500 italic text-sm">None listed</p>
            )}
          </div>
        </div>
      </div>

      {/* Compliance Tracking */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
          <h3 className="font-bold text-zinc-900 flex items-center gap-2">
            <Shield size={18} className="text-partners-blue-dark" /> Compliance Tracking & Alerts
          </h3>
        </div>
        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <ComplianceItem title="Annual Physical" lastDate={patient.last_annual_physical}
              dueDate={patient.last_annual_physical ? addYears(parseLocalDate(patient.last_annual_physical)!, 1) : null} type="annual" />
            <ComplianceItem title="Health Status Report" lastDate={patient.last_semi_annual_report}
              dueDate={patient.last_semi_annual_report ? addMonths(parseLocalDate(patient.last_semi_annual_report)!, 6) : null} type="semi-annual" />
            <ComplianceItem title="Monthly Visit" lastDate={patient.last_monthly_visit}
              dueDate={patient.last_monthly_visit ? addMonths(parseLocalDate(patient.last_monthly_visit)!, 1) : null} type="monthly" />

            <div className="p-4 rounded-2xl border border-zinc-100 bg-zinc-50/30 space-y-3">
              <div className="flex justify-between items-start">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Medical Leave (MLOA)</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${patient.mloa_days > 30 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {patient.mloa_days}/30 Days
                </span>
              </div>
              <div className="w-full bg-zinc-200 h-1.5 rounded-full overflow-hidden">
                <div className={`h-full transition-all ${patient.mloa_days > 30 ? 'bg-red-500' : 'bg-partners-green'}`}
                  style={{ width: `${Math.min((patient.mloa_days / 30) * 100, 100)}%` }} />
              </div>
              {patient.mloa_days > 30 && (
                <p className="text-[10px] text-red-600 font-medium flex items-center gap-1">
                  <AlertCircle size={12} /> Exceeded annual billable limit
                </p>
              )}
            </div>

            <div className="p-4 rounded-2xl border border-zinc-100 bg-zinc-50/30 space-y-3">
              <div className="flex justify-between items-start">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Non-Medical Leave (NMLOA)</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${patient.nmloa_days > 45 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {patient.nmloa_days}/45 Days
                </span>
              </div>
              <div className="w-full bg-zinc-200 h-1.5 rounded-full overflow-hidden">
                <div className={`h-full transition-all ${patient.nmloa_days > 45 ? 'bg-red-500' : 'bg-partners-green'}`}
                  style={{ width: `${Math.min((patient.nmloa_days / 45) * 100, 100)}%` }} />
              </div>
              {patient.nmloa_days > 45 && (
                <p className="text-[10px] text-red-600 font-medium flex items-center gap-1">
                  <AlertCircle size={12} /> Exceeded annual billable limit
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Submitted Forms */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
          <h3 className="font-bold text-zinc-900 flex items-center gap-2">
            <ClipboardCheck size={18} className="text-partners-blue-dark" /> Submitted Forms
          </h3>
          {!formsLoading && submittedForms.length > 0 && (
            <span className="text-xs font-bold text-zinc-500 bg-zinc-100 px-3 py-1 rounded-full">
              {submittedForms.length} {submittedForms.length === 1 ? 'form' : 'forms'}
            </span>
          )}
        </div>

        <div className="p-6">
          {formsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                  <div className="space-y-2 flex-1">
                    <div className="h-3 bg-zinc-200 rounded w-1/3" />
                    <div className="h-2 bg-zinc-100 rounded w-1/5" />
                  </div>
                  <div className="h-6 w-20 bg-zinc-200 rounded-full" />
                </div>
              ))}
            </div>
          ) : submittedForms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4">
                <FileText size={28} className="text-zinc-400" />
              </div>
              <p className="text-sm font-bold text-zinc-500">No forms submitted yet</p>
              <p className="text-xs text-zinc-400 mt-1">Submitted clinical forms will appear here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {submittedForms.map(fr => {
                const formName = resolveSubmissionFormName(fr);
                const routePath = FORM_ROUTES[formName];
                const viewUrl = routePath
                  ? `${routePath}?patientId=${patient?.id}&id=${fr.id}`
                  : null;

                return (
                  <div key={fr.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4 border border-zinc-100 rounded-2xl hover:bg-zinc-50/60 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-partners-blue-dark/10 flex items-center justify-center flex-shrink-0">
                        <FileText size={16} className="text-partners-blue-dark" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-zinc-900 truncate">{formName}</p>
                        <p className="text-[11px] text-zinc-400">
                          {fr.created_at ? format(new Date(fr.created_at), 'MMM d, yyyy · h:mm a') : '—'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${formStatusStyle(fr.status)}`}>
                        {fr.status ?? 'unknown'}
                      </span>
                      {viewUrl ? (
                        <Link
                          to={viewUrl}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-partners-blue-dark bg-partners-blue-dark/10 hover:bg-partners-blue-dark/20 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <ChevronRight size={13} /> View Form
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Clinical Forms */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
          <h3 className="font-bold text-zinc-900">Clinical Forms</h3>
          <p className="text-xs text-zinc-500">Quickly create new clinical documentation</p>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[
            { to: `/progress-note?patientId=${patient.id}`, icon: <FileText className="w-8 h-8 text-emerald-600" />, bg: 'bg-emerald-50 border-emerald-100', label: 'Progress Note' },
            { to: `/care-plan?patientId=${patient.id}`, icon: <FileText className="w-8 h-8 text-blue-600" />, bg: 'bg-blue-50 border-blue-100', label: 'Care Plan' },
            { to: `/mds-assessment?patientId=${patient.id}`, icon: <ClipboardCheck className="w-8 h-8 text-cyan-600" />, bg: 'bg-cyan-50 border-cyan-100', label: 'MDS Assessment' },
            { to: `/nursing-assessment?patientId=${patient.id}`, icon: <Stethoscope className="w-8 h-8 text-orange-600" />, bg: 'bg-orange-50 border-orange-100', label: 'Nursing Assessment' },
            { to: `/request-for-services?patientId=${patient.id}`, icon: <FileText className="w-8 h-8 text-rose-600" />, bg: 'bg-rose-50 border-rose-100', label: 'Request Services' },
            { to: `/cirf?patientId=${patient.id}`, icon: <FileText className="w-8 h-8 text-purple-600" />, bg: 'bg-purple-50 border-purple-100', label: 'CIRF' },
            { to: `/mar?patientId=${patient.id}`, icon: <Pill className="w-8 h-8 text-pink-600" />, bg: 'bg-pink-50 border-pink-100', label: 'MAR' },
            { to: `/tar?patientId=${patient.id}`, icon: <Activity className="w-8 h-8 text-indigo-600" />, bg: 'bg-indigo-50 border-indigo-100', label: 'TAR' },
            { to: `/physician-summary?patientId=${patient.id}`, icon: <FileText className="w-8 h-8 text-amber-600" />, bg: 'bg-amber-50 border-amber-100', label: 'Physician Summary' },
            { to: `/physician-orders?patientId=${patient.id}`, icon: <FileSignature className="w-8 h-8 text-purple-600" />, bg: 'bg-purple-50 border-purple-100', label: 'Physician Orders' },
            { to: `/patient-resource-data?patientId=${patient.id}`, icon: <FileText className="w-8 h-8 text-teal-600" />, bg: 'bg-teal-50 border-teal-100', label: 'Resource Data' },
            { to: `/admission-assessment?patientId=${patient.id}`, icon: <UserPlus className="w-8 h-8 text-emerald-600" />, bg: 'bg-emerald-50 border-emerald-100', label: 'Admission' },
            { to: `/discharge-summary?patientId=${patient.id}`, icon: <UserMinus className="w-8 h-8 text-rose-600" />, bg: 'bg-rose-50 border-rose-100', label: 'Discharge' },
          ].map(item => (
            <Link key={item.to} to={item.to} className={`p-4 ${item.bg} border rounded-2xl hover:shadow-md transition-all group`}>
              <div className="mb-3 group-hover:scale-110 transition-transform">{item.icon}</div>
              <p className="text-sm font-bold text-zinc-900">{item.label}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Visit History */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
          <h3 className="font-bold text-zinc-900">Visit History</h3>
          <Button variant="secondary" size="sm">View All</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50">
                {['Date', 'Type', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visits.length > 0 ? visits.map((visit) => (
                <tr key={visit.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-zinc-700">
                    {visit.scheduled_at ? format(new Date(visit.scheduled_at), 'MMM d, yyyy h:mm a') : 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-zinc-900">{visit.type || 'N/A'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      visit.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'
                    }`}>
                      {visit.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Button variant="ghost" size="sm" className="text-partners-blue-dark">View Details</Button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-zinc-500 italic">
                    No visits recorded for this patient.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Documents & Files */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
          <h3 className="font-bold text-zinc-900">Documents & Files</h3>
        </div>
        <div className="p-6">
          <FileUpload patientId={patient.id} />
        </div>
      </div>
    </div>
  );
};
