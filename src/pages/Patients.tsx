import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../services/supabase';
import { clsx } from 'clsx';
import { 
  Search, Plus, Trash2, Edit2, UserPlus, Filter,
  Calendar as CalendarIcon, FileText, X, ClipboardCheck,
  Stethoscope, Pill, Activity, FileSignature, UserMinus,
  ChevronDown, Paperclip, Phone, Printer, MapPin, Building2, Check,
  ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import { Button } from '../components/Button';
import { Link, useSearchParams } from 'react-router-dom';
import { parseLocalDate } from '../utils/dates';
import { Modal } from '../components/Modal';
import { Notification, NotificationType } from '../components/Notification';
import { FileUpload } from '../components/FileUpload';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMedicalProviders, usePatientList } from '../queries/patients';

const patientSchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  dob: z.string().min(1, 'Required'),
  gender: z.string().min(1, 'Required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  street: z.string().optional(),
  apt: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  insurance_id: z.string().optional(),
  ssn_encrypted: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  mloa_days: z.number().min(0).max(365).optional(),
  nmloa_days: z.number().min(0).max(365).optional(),
  last_annual_physical: z.string().optional().or(z.literal('')),
  last_semi_annual_report: z.string().optional().or(z.literal('')),
  last_monthly_visit: z.string().optional().or(z.literal('')),
  preferred_name: z.string().optional(),
  race: z.string().optional(),
  religion: z.string().optional(),
  marital_status: z.string().optional(),
  primary_language: z.string().optional(),
  height: z.string().optional(),
  weight: z.string().optional(),
  is_responsible_for_self: z.boolean().optional(),
  mds_date: z.string().optional().or(z.literal('')),
  hospital_of_choice: z.string().optional(),
  start_of_service: z.string().optional().or(z.literal('')),
  occupation: z.string().optional(),
  mothers_maiden_name: z.string().optional(),
  primary_payer: z.string().optional(),
  primary_payer_id: z.string().optional(),
  medicare_id: z.string().optional(),
  medicaid_id: z.string().optional(),
  other_insurance: z.string().optional(),
  other_insurance_id: z.string().optional(),
  pharmacy_name: z.string().optional(),
  pharmacy_phone: z.string().optional(),
  pharmacy_street: z.string().optional(),
  pharmacy_apt: z.string().optional(),
  pharmacy_city: z.string().optional(),
  pharmacy_state: z.string().optional(),
  pharmacy_zip: z.string().optional(),
  transportation_company_name: z.string().optional(),
  transportation_company_phone: z.string().optional(),
  transportation_company_street: z.string().optional(),
  transportation_company_apt: z.string().optional(),
  transportation_company_city: z.string().optional(),
  transportation_company_state: z.string().optional(),
  transportation_company_zip: z.string().optional(),
  adult_day_health_name: z.string().optional(),
  adult_day_health_phone: z.string().optional(),
  adult_day_health_street: z.string().optional(),
  adult_day_health_apt: z.string().optional(),
  adult_day_health_city: z.string().optional(),
  adult_day_health_state: z.string().optional(),
  adult_day_health_zip: z.string().optional(),
  living_will: z.string().optional(),
  full_code: z.string().optional(),
  organ_donation: z.string().optional(),
  autopsy_request: z.string().optional(),
  hospice: z.string().optional(),
  dnr: z.string().optional(),
  dni: z.string().optional(),
  dnh: z.string().optional(),
  feeding_restrictions: z.string().optional(),
  medication_restrictions: z.string().optional(),
  other_treatment_restrictions: z.string().optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  emergency_contact_relationship: z.string().optional(),
  emergency_contact_address: z.object({
    street: z.string().optional(), apt: z.string().optional(),
    city: z.string().optional(), state: z.string().optional(), zip: z.string().optional(),
  }).optional(),
  pcp_id: z.string().optional(),
  other_provider_ids: z.string().optional(),
  diagnoses: z.array(z.object({ disease: z.string().min(1, 'Required'), icd10: z.string().min(1, 'Required') })).optional(),
  medications: z.array(z.object({
    medicine: z.string().min(1, 'Required'),
    dosage: z.string().min(1, 'Required'),
    number: z.string().optional(),
    route: z.string().optional(),
    schedule: z.string().min(1, 'Required'),
  })).optional(),
});

type PatientFormValues = z.infer<typeof patientSchema>;

interface Patient {
  id: string; first_name: string; last_name: string; dob: string; gender: string;
  phone: string | null; email: string | null; street: string | null; apt: string | null;
  city: string | null; state: string | null; zip: string | null; insurance_id: string | null;
  ssn_encrypted: string | null; status: 'active' | 'inactive'; mloa_days: number; nmloa_days: number;
  last_annual_physical: string | null; last_semi_annual_report: string | null; last_monthly_visit: string | null;
  preferred_name: string | null; race: string | null; religion: string | null; marital_status: string | null;
  primary_language: string | null; height: string | null; weight: string | null;
  is_responsible_for_self: boolean; mds_date: string | null; hospital_of_choice: string | null;
  start_of_service: string | null; occupation: string | null; mothers_maiden_name: string | null;
  primary_payer: string | null; primary_payer_id: string | null; medicare_id: string | null; medicaid_id: string | null;
  other_insurance: string | null; other_insurance_id: string | null;
  pharmacy_name: string | null; pharmacy_phone: string | null; pharmacy_street: string | null; pharmacy_apt: string | null;
  pharmacy_city: string | null; pharmacy_state: string | null; pharmacy_zip: string | null;
  transportation_company_name: string | null; transportation_company_phone: string | null;
  transportation_company_street: string | null; transportation_company_apt: string | null;
  transportation_company_city: string | null; transportation_company_state: string | null; transportation_company_zip: string | null;
  adult_day_health_name: string | null; adult_day_health_phone: string | null; adult_day_health_street: string | null;
  adult_day_health_apt: string | null; adult_day_health_city: string | null; adult_day_health_state: string | null;
  adult_day_health_zip: string | null;
  living_will: string | null;
  full_code: string | null; organ_donation: string | null; autopsy_request: string | null;
  hospice: string | null; dnr: string | null; dni: string | null; dnh: string | null;
  feeding_restrictions: string | null; medication_restrictions: string | null; other_treatment_restrictions: string | null;
  emergency_contact_name: string | null; emergency_contact_phone: string | null; emergency_contact_relationship: string | null;
  emergency_contact_address: { street?: string; apt?: string; city?: string; state?: string; zip?: string; } | null;
  pcp_id: string | null;
  // ── FIXED: accept both array (from Supabase) and string (comma-separated) ──
  other_provider_ids: string | string[] | null;
  diagnoses: { disease: string; icd10: string; }[] | null;
  medications: { medicine: string; dosage: string; number?: string; route?: string; schedule: string; }[] | null;
  created_at: string; last_visit?: string;
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

// ── Helper: normalize other_provider_ids to a string[] regardless of DB format ──
type PatientSortKey = 'name' | 'dob' | 'status' | 'last_visit';
type SortDirection = 'asc' | 'desc';

const normalizeProviderIds = (val: string | string[] | null | undefined): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  return String(val).split(',').map(s => s.trim()).filter(Boolean);
};

// ── Provider detail card shown inline in the form ──────────────────────────
const ProviderDetailCard: React.FC<{ provider: MedicalProvider }> = ({ provider }) => (
  <div className="mt-3 p-4 rounded-2xl bg-partners-blue-dark/5 border border-partners-blue-dark/15 space-y-2">
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-xl bg-partners-blue-dark/10 text-partners-blue-dark flex items-center justify-center shrink-0">
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
          <Printer size={12} className="text-zinc-400 shrink-0" /> Fax: {provider.fax}
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

export const Patients: React.FC = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [patientToDelete, setPatientToDelete] = useState<string | null>(null);
  const [patientForFiles, setPatientForFiles] = useState<Patient | null>(null);
  const [notification, setNotification] = useState<{ type: NotificationType, message: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState('All');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortKey, setSortKey] = useState<PatientSortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [medicalProviders, setMedicalProviders] = useState<MedicalProvider[]>([]);
  const [searchParams] = useSearchParams();
  const editFromUrlHandled = useRef(false);

  const [selectedPcp, setSelectedPcp] = useState<MedicalProvider | null>(null);
  const [selectedOtherProviders, setSelectedOtherProviders] = useState<MedicalProvider[]>([]);
  const [otherProviderSearch, setOtherProviderSearch] = useState('');
  const [showOtherProviderDropdown, setShowOtherProviderDropdown] = useState(false);
  const otherProviderRef = useRef<HTMLDivElement>(null);
  const patientsQuery = usePatientList();
  const medicalProvidersQuery = useMedicalProviders();

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId || patients.length === 0 || editFromUrlHandled.current) return;
    const patient = patients.find(p => p.id === editId);
    if (patient) { editFromUrlHandled.current = true; openEditModal(patient); }
  }, [searchParams, patients]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (otherProviderRef.current && !otherProviderRef.current.contains(e.target as Node)) {
        setShowOtherProviderDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const { register, handleSubmit, reset, setValue, watch, control, formState: { errors, isSubmitting } } = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      mloa_days: 0, nmloa_days: 0, status: 'active',
      emergency_contact_address: { street: '', apt: '', city: '', state: '', zip: '' },
      diagnoses: [], medications: []
    }
  });

  const { fields: diagnosisFields, append: appendDiagnosis, remove: removeDiagnosis } = useFieldArray({ control, name: 'diagnoses' });
  const { fields: medicationFields, append: appendMedication, remove: removeMedication } = useFieldArray({ control, name: 'medications' });

  const dob = watch('dob');
  const calculateAge = (d: string) => {
    if (!d) return '';
    const bd = new Date(d); const today = new Date();
    let age = today.getFullYear() - bd.getFullYear();
    const m = today.getMonth() - bd.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
    return age;
  };

  const handlePcpChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setValue('pcp_id', id);
    setSelectedPcp(medicalProviders.find(p => p.id === id) || null);
  };

  const toggleOtherProvider = (provider: MedicalProvider) => {
    setSelectedOtherProviders(prev => {
      const exists = prev.find(p => p.id === provider.id);
      const next = exists ? prev.filter(p => p.id !== provider.id) : [...prev, provider];
      setValue('other_provider_ids', next.map(p => p.id).join(','));
      return next;
    });
  };

  const removeOtherProvider = (id: string) => {
    setSelectedOtherProviders(prev => {
      const next = prev.filter(p => p.id !== id);
      setValue('other_provider_ids', next.map(p => p.id).join(','));
      return next;
    });
  };

  const filteredOtherProviders = medicalProviders.filter(p =>
    `${p.first_name} ${p.last_name} ${p.facility_name}`.toLowerCase().includes(otherProviderSearch.toLowerCase())
  );

  const openEditModal = async (patient: Patient) => {
    try {
      const { data } = await supabase
        .from('patients')
        .select('*')
        .eq('id', patient.id)
        .maybeSingle();
      if (data) patient = data as Patient;
    } catch (error) {
      console.warn('Unable to hydrate patient before editing:', error);
    }

    setEditingPatient(patient);

    // resolve PCP
    const pcp = medicalProviders.find(p => p.id === patient.pcp_id) || null;
    setSelectedPcp(pcp);

    // ── FIXED: safely normalize other_provider_ids regardless of DB format ──
    const otherIds = normalizeProviderIds(patient.other_provider_ids);
    setSelectedOtherProviders(medicalProviders.filter(p => otherIds.includes(p.id)));

    const fields: [keyof PatientFormValues, any][] = [
      ['first_name', patient.first_name], ['last_name', patient.last_name], ['dob', patient.dob],
      ['gender', patient.gender], ['phone', patient.phone || ''], ['email', patient.email || ''],
      ['street', patient.street || ''], ['apt', patient.apt || ''], ['city', patient.city || ''],
      ['state', patient.state || ''], ['zip', patient.zip || ''], ['insurance_id', patient.insurance_id || ''],
      ['ssn_encrypted', patient.ssn_encrypted || ''], ['status', patient.status],
      ['mloa_days', patient.mloa_days || 0], ['nmloa_days', patient.nmloa_days || 0],
      ['last_annual_physical', patient.last_annual_physical || ''],
      ['last_semi_annual_report', patient.last_semi_annual_report || ''],
      ['last_monthly_visit', patient.last_monthly_visit || ''],
      ['preferred_name', patient.preferred_name || ''], ['race', patient.race || ''],
      ['religion', patient.religion || ''], ['marital_status', patient.marital_status || ''],
      ['primary_language', patient.primary_language || ''], ['height', patient.height || ''],
      ['weight', patient.weight || ''], ['is_responsible_for_self', patient.is_responsible_for_self ?? true],
      ['mds_date', patient.mds_date || ''], ['hospital_of_choice', patient.hospital_of_choice || ''],
      ['start_of_service', patient.start_of_service || ''], ['occupation', patient.occupation || ''],
      ['mothers_maiden_name', patient.mothers_maiden_name || ''], ['primary_payer', patient.primary_payer || ''],
      ['primary_payer_id', patient.primary_payer_id || ''],
      ['medicare_id', patient.medicare_id || ''], ['medicaid_id', patient.medicaid_id || ''],
      ['other_insurance', patient.other_insurance || ''], ['other_insurance_id', patient.other_insurance_id || ''],
      ['pharmacy_name', patient.pharmacy_name || ''], ['pharmacy_phone', patient.pharmacy_phone || ''],
      ['pharmacy_street', patient.pharmacy_street || ''], ['pharmacy_apt', patient.pharmacy_apt || ''],
      ['pharmacy_city', patient.pharmacy_city || ''], ['pharmacy_state', patient.pharmacy_state || ''],
      ['pharmacy_zip', patient.pharmacy_zip || ''],
      ['transportation_company_name', patient.transportation_company_name || ''],
      ['transportation_company_phone', patient.transportation_company_phone || ''],
      ['transportation_company_street', patient.transportation_company_street || ''],
      ['transportation_company_apt', patient.transportation_company_apt || ''],
      ['transportation_company_city', patient.transportation_company_city || ''],
      ['transportation_company_state', patient.transportation_company_state || ''],
      ['transportation_company_zip', patient.transportation_company_zip || ''],
      ['adult_day_health_name', patient.adult_day_health_name || ''],
      ['adult_day_health_phone', patient.adult_day_health_phone || ''],
      ['adult_day_health_street', patient.adult_day_health_street || ''],
      ['adult_day_health_apt', patient.adult_day_health_apt || ''],
      ['adult_day_health_city', patient.adult_day_health_city || ''],
      ['adult_day_health_state', patient.adult_day_health_state || ''],
      ['adult_day_health_zip', patient.adult_day_health_zip || ''],
      ['living_will', patient.living_will || 'No'], ['full_code', patient.full_code || 'No'],
      ['organ_donation', patient.organ_donation || 'No'], ['autopsy_request', patient.autopsy_request || 'No'],
      ['hospice', patient.hospice || 'No'], ['dnr', patient.dnr || 'No'],
      ['dni', patient.dni || 'No'], ['dnh', patient.dnh || 'No'],
      ['feeding_restrictions', patient.feeding_restrictions || 'No'],
      ['medication_restrictions', patient.medication_restrictions || 'No'],
      ['other_treatment_restrictions', patient.other_treatment_restrictions || 'No'],
      ['emergency_contact_name', patient.emergency_contact_name || ''],
      ['emergency_contact_phone', patient.emergency_contact_phone || ''],
      ['emergency_contact_relationship', patient.emergency_contact_relationship || ''],
      ['emergency_contact_address', patient.emergency_contact_address || { street: '', apt: '', city: '', state: '', zip: '' }],
      ['pcp_id', patient.pcp_id || ''],
      // ── FIXED: always store as comma-separated string in form field ──
      ['other_provider_ids', otherIds.join(',')],
      ['diagnoses', patient.diagnoses || []], ['medications', patient.medications || []],
    ];
    fields.forEach(([k, v]) => setValue(k, v));
    setIsModalOpen(true);
  };

  useEffect(() => {
    setLoading(patientsQuery.isLoading || patientsQuery.isFetching);
    if (patientsQuery.data) setPatients(patientsQuery.data as Patient[]);
    if (patientsQuery.error) console.error('Error fetching patients:', patientsQuery.error);
  }, [patientsQuery.data, patientsQuery.error, patientsQuery.isFetching, patientsQuery.isLoading]);

  useEffect(() => {
    if (medicalProvidersQuery.data) setMedicalProviders(medicalProvidersQuery.data as MedicalProvider[]);
    if (medicalProvidersQuery.error) console.error('Error fetching providers:', medicalProvidersQuery.error);
  }, [medicalProvidersQuery.data, medicalProvidersQuery.error]);

  const fetchMedicalProviders = async () => {
    try {
      const result = await medicalProvidersQuery.refetch();
      setMedicalProviders((result.data || []) as MedicalProvider[]);
    } catch (e) { console.error('Error fetching providers:', e); }
  };

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const result = await patientsQuery.refetch();
      setPatients((result.data || []) as Patient[]);
    } catch (e) { console.error('Error fetching patients:', e); }
    finally { setLoading(false); }
  };

  const resetFormState = () => {
    reset();
    setSelectedPcp(null);
    setSelectedOtherProviders([]);
    setOtherProviderSearch('');
    setShowOtherProviderDropdown(false);
  };

  const onSubmit = async (data: PatientFormValues) => {
    try {
      const patientData: any = {
        first_name: data.first_name, last_name: data.last_name, dob: data.dob, gender: data.gender,
        phone: data.phone, email: data.email, street: data.street, apt: data.apt, city: data.city,
        state: data.state, zip: data.zip, insurance_id: data.insurance_id, ssn_encrypted: data.ssn_encrypted,
        status: data.status || 'active', mloa_days: data.mloa_days, nmloa_days: data.nmloa_days,
        last_annual_physical: data.last_annual_physical || null, last_semi_annual_report: data.last_semi_annual_report || null,
        last_monthly_visit: data.last_monthly_visit || null, preferred_name: data.preferred_name || null,
        race: data.race || null, religion: data.religion || null, marital_status: data.marital_status || null,
        primary_language: data.primary_language || null, height: data.height || null, weight: data.weight || null,
        is_responsible_for_self: data.is_responsible_for_self, mds_date: data.mds_date || null,
        hospital_of_choice: data.hospital_of_choice || null, start_of_service: data.start_of_service || null,
        occupation: data.occupation || null, mothers_maiden_name: data.mothers_maiden_name || null,
        primary_payer: data.primary_payer || null, primary_payer_id: data.primary_payer_id || null,
        medicare_id: data.medicare_id || null,
        medicaid_id: data.medicaid_id || null, other_insurance: data.other_insurance || null,
        other_insurance_id: data.other_insurance_id || null,
        pharmacy_name: data.pharmacy_name || null, pharmacy_phone: data.pharmacy_phone || null,
        pharmacy_street: data.pharmacy_street || null, pharmacy_apt: data.pharmacy_apt || null,
        pharmacy_city: data.pharmacy_city || null, pharmacy_state: data.pharmacy_state || null,
        pharmacy_zip: data.pharmacy_zip || null,
        transportation_company_name: data.transportation_company_name || null,
        transportation_company_phone: data.transportation_company_phone || null,
        transportation_company_street: data.transportation_company_street || null,
        transportation_company_apt: data.transportation_company_apt || null,
        transportation_company_city: data.transportation_company_city || null,
        transportation_company_state: data.transportation_company_state || null,
        transportation_company_zip: data.transportation_company_zip || null,
        adult_day_health_name: data.adult_day_health_name || null,
        adult_day_health_phone: data.adult_day_health_phone || null,
        adult_day_health_street: data.adult_day_health_street || null,
        adult_day_health_apt: data.adult_day_health_apt || null,
        adult_day_health_city: data.adult_day_health_city || null,
        adult_day_health_state: data.adult_day_health_state || null,
        adult_day_health_zip: data.adult_day_health_zip || null,
        living_will: data.living_will || null,
        full_code: data.full_code || null, organ_donation: data.organ_donation || null,
        autopsy_request: data.autopsy_request || null, hospice: data.hospice || null,
        dnr: data.dnr || null, dni: data.dni || null, dnh: data.dnh || null,
        feeding_restrictions: data.feeding_restrictions || null, medication_restrictions: data.medication_restrictions || null,
        other_treatment_restrictions: data.other_treatment_restrictions || null,
        emergency_contact_name: data.emergency_contact_name || null, emergency_contact_phone: data.emergency_contact_phone || null,
        emergency_contact_relationship: data.emergency_contact_relationship || null,
        emergency_contact_address: data.emergency_contact_address || null, pcp_id: data.pcp_id || null,
        other_provider_ids: data.other_provider_ids || null, diagnoses: data.diagnoses || [],
        medications: (data.medications || []).map(m => ({
          medicine: m.medicine, dosage: m.dosage, number: m.number || '', route: m.route || '', schedule: m.schedule,
        }))
      };
      const url = editingPatient ? '/api/patients/update' : '/api/patients/create';
      const body = editingPatient ? { id: editingPatient.id, ...patientData } : patientData;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to save patient');
      setNotification({ type: 'success', message: editingPatient ? 'Patient updated successfully!' : 'New patient added successfully!' });
      setIsModalOpen(false); setEditingPatient(null); resetFormState(); await fetchPatients();
    } catch (e: any) {
      setNotification({ type: 'error', message: 'Error saving patient: ' + e.message });
    }
  };

  const handleDelete = async () => {
    if (!patientToDelete) return;
    try {
      const res = await fetch('/api/patients/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: patientToDelete }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to delete');
      await fetchPatients();
      setNotification({ type: 'success', message: 'Patient deleted successfully.' });
    } catch (e: any) {
      setNotification({ type: 'error', message: 'Error deleting patient: ' + e.message });
    } finally { setPatientToDelete(null); }
  };

  const getDateValue = (value: string | null | undefined) => {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
  };

  const getEndOfDayValue = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 0;
    date.setHours(23, 59, 59, 999);
    return date.getTime();
  };

  const isPatientInDateRange = (patient: Patient) => {
    if (!dateFrom && !dateTo) return true;
    const createdAt = getDateValue(patient.created_at);
    if (!createdAt) return false;
    let from = dateFrom ? getDateValue(dateFrom) : 0;
    let to = dateTo ? getEndOfDayValue(dateTo) : Number.POSITIVE_INFINITY;
    if (dateFrom && dateTo && from > to) {
      const originalFrom = from;
      from = getDateValue(dateTo);
      to = new Date(originalFrom).setHours(23, 59, 59, 999);
    }
    return createdAt >= from && createdAt <= to;
  };

  const comparePatients = (a: Patient, b: Patient) => {
    const direction = sortDirection === 'asc' ? 1 : -1;

    if (sortKey === 'name') {
      const aName = `${a.last_name} ${a.first_name}`.toLowerCase();
      const bName = `${b.last_name} ${b.first_name}`.toLowerCase();
      return aName.localeCompare(bName) * direction;
    }

    if (sortKey === 'status') {
      return a.status.localeCompare(b.status) * direction;
    }

    const aValue = getDateValue(sortKey === 'dob' ? a.dob : a.last_visit);
    const bValue = getDateValue(sortKey === 'dob' ? b.dob : b.last_visit);
    return (aValue - bValue) * direction;
  };

  const handleSort = (key: PatientSortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

  const filteredPatients = useMemo(() => {
    const normalizedSearch = searchTerm.toLowerCase();
    return patients
      .filter(p =>
        (filterStatus === 'All' || p.status === filterStatus.toLowerCase()) &&
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(normalizedSearch) &&
        isPatientInDateRange(p)
      )
      .sort(comparePatients);
  }, [patients, filterStatus, searchTerm, dateFrom, dateTo, sortKey, sortDirection]);

  const FormsDropdown = ({ patientId }: { patientId: string }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [position, setPosition] = useState<'top' | 'bottom'>('bottom');
    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      if (isOpen && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setPosition(window.innerHeight - rect.bottom < 350 && rect.top > window.innerHeight - rect.bottom ? 'top' : 'bottom');
      }
    }, [isOpen]);
    const links = [
      { to: `/progress-note?patientId=${patientId}`, icon: <FileText size={14} className="text-emerald-500" />, label: 'Progress Note' },
      { to: `/care-plan?patientId=${patientId}`, icon: <FileText size={14} className="text-blue-500" />, label: 'Care Plan' },
      { to: `/mds-assessment?patientId=${patientId}`, icon: <ClipboardCheck size={14} className="text-cyan-500" />, label: 'MDS Assessment' },
      { to: `/nursing-assessment?patientId=${patientId}`, icon: <Stethoscope size={14} className="text-orange-500" />, label: 'Nursing Assessment' },
      { to: `/request-for-services?patientId=${patientId}`, icon: <FileText size={14} className="text-rose-500" />, label: 'Request for Services' },
      { to: `/cirf?patientId=${patientId}`, icon: <FileText size={14} className="text-purple-500" />, label: 'CIRF' },
      { to: `/mar?patientId=${patientId}`, icon: <Pill size={14} className="text-pink-500" />, label: 'MAR' },
      { to: `/tar?patientId=${patientId}`, icon: <Activity size={14} className="text-indigo-500" />, label: 'TAR' },
      { to: `/physician-summary?patientId=${patientId}`, icon: <FileText size={14} className="text-amber-500" />, label: 'Physician Summary' },
      { to: `/physician-orders?patientId=${patientId}`, icon: <FileSignature size={14} className="text-purple-500" />, label: 'Physician Orders' },
      { to: `/admission-assessment?patientId=${patientId}`, icon: <UserPlus size={14} className="text-emerald-500" />, label: 'Admission Assessment' },
      { to: `/discharge-summary?patientId=${patientId}`, icon: <UserMinus size={14} className="text-rose-500" />, label: 'Discharge Summary' },
    ];
    return (
      <div ref={containerRef} className="relative inline-block" onMouseEnter={() => setIsOpen(true)} onMouseLeave={() => setIsOpen(false)}>
        <Button variant="ghost" size="sm" className="rounded-full text-xs flex items-center gap-1">
          Forms <ChevronDown size={14} />
        </Button>
        <div className={clsx(
          'absolute left-1/2 -translate-x-1/2 w-64 bg-white rounded-2xl border border-zinc-200 shadow-2xl z-50 overflow-hidden transition-all duration-200',
          isOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none',
          position === 'bottom' ? 'top-full mt-[-2px]' : 'bottom-full mb-[-2px]'
        )}>
          <div className="p-2 grid grid-cols-1 gap-1 max-h-80 overflow-y-auto">
            {links.map(l => (
              <Link key={l.to} to={l.to} className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-600 hover:bg-zinc-50 rounded-xl transition-colors">
                {l.icon} {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const inputCls = "w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none transition-all";
  const sectionTitle = "text-sm font-bold text-partners-blue-dark uppercase tracking-wider border-b-2 border-partners-blue-dark/20 pb-2";
  const patientColumns: { key: PatientSortKey; label: string }[] = [
    { key: 'name', label: 'Name' },
    { key: 'dob', label: 'DOB' },
    { key: 'status', label: 'Status' },
    { key: 'last_visit', label: 'Last Visit' },
  ];

  const SortIcon = ({ columnKey }: { columnKey: PatientSortKey }) => {
    if (sortKey !== columnKey) return <ArrowUpDown size={14} className="text-zinc-300" />;
    return sortDirection === 'asc'
      ? <ArrowUp size={14} className="text-partners-blue-dark" />
      : <ArrowDown size={14} className="text-partners-blue-dark" />;
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 italic">Patients</h1>
          <p className="text-sm md:text-base text-zinc-500">Manage participant records and clinical history</p>
        </div>
        <Button className="rounded-full px-6 w-full sm:w-auto" onClick={() => { setEditingPatient(null); resetFormState(); setIsModalOpen(true); }}>
          <UserPlus className="w-4 h-4 mr-2" /> Add Patient
        </Button>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="relative w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
          <input type="text" placeholder="Search by name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-partners-blue-dark outline-none transition-all shadow-sm" />
        </div>
        <div className="relative w-full md:w-auto">
          <Button variant="secondary" className="rounded-2xl h-[50px] w-full md:w-auto" onClick={() => setShowFilterMenu(!showFilterMenu)}>
            <Filter className="w-4 h-4 mr-2" />{filterStatus === 'All' ? 'Filter' : filterStatus}
          </Button>
          {showFilterMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl border border-zinc-200 shadow-xl z-50 overflow-hidden">
              {['All', 'Active', 'Inactive'].map(s => (
                <button key={s} onClick={() => { setFilterStatus(s); setShowFilterMenu(false); }}
                  className={`w-full text-left px-4 py-3 text-sm hover:bg-zinc-50 transition-colors ${filterStatus === s ? 'text-partners-blue-dark font-bold bg-partners-blue-dark/5' : 'text-zinc-600'}`}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="w-full md:w-auto bg-white border border-zinc-200 rounded-2xl shadow-sm px-3 py-2">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <span className="self-center text-xs font-bold text-zinc-400 uppercase tracking-wider">Created</span>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full sm:w-40 pl-9 pr-3 py-1.5 text-sm outline-none bg-transparent text-zinc-700"
                aria-label="Filter patients created from date"
              />
            </div>
            <span className="hidden sm:inline text-xs font-medium text-zinc-400">to</span>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full sm:w-40 pl-9 pr-3 py-1.5 text-sm outline-none bg-transparent text-zinc-700"
                aria-label="Filter patients created to date"
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="self-center p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Clear date range"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white rounded-3xl border border-zinc-200 shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-200">
              {patientColumns.map(column => (
                <th key={column.key} className="px-6 py-4">
                  <button
                    type="button"
                    onClick={() => handleSort(column.key)}
                    className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 uppercase tracking-wider hover:text-partners-blue-dark transition-colors"
                  >
                    {column.label}
                    <SortIcon columnKey={column.key} />
                  </button>
                </th>
              ))}
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {[32, 24, 16, 24].map((w, j) => <td key={j} className="px-6 py-4"><div className={`h-4 bg-zinc-100 rounded w-${w}`}></div></td>)}
                  <td className="px-6 py-4"></td>
                </tr>
              ))
            ) : filteredPatients.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-zinc-500">No patients found.</td></tr>
            ) : filteredPatients.map(patient => (
              <tr key={patient.id} className="hover:bg-zinc-50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-partners-blue-dark/10 text-partners-blue-dark flex items-center justify-center font-bold">
                      {patient.first_name[0]}{patient.last_name[0]}
                    </div>
                    <div>
                      <p className="font-bold text-zinc-900">{patient.last_name}, {patient.first_name}</p>
                      <p className="text-xs text-zinc-500">ID: {patient.id.slice(0, 8)}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-zinc-600 font-mono text-sm">{parseLocalDate(patient.dob)?.toLocaleDateString() ?? '--'}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${patient.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>
                    {patient.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-zinc-500 text-sm">{patient.last_visit ? new Date(patient.last_visit).toLocaleDateString() : '--'}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEditModal(patient)} title="Edit" className="p-2 text-zinc-400 hover:text-partners-blue-dark hover:bg-partners-blue-dark/5 rounded-xl transition-colors"><Edit2 size={16} /></button>
                    <Link to={`/patient-profile/${patient.id}`}><Button variant="ghost" size="sm" className="rounded-full text-xs">Profile</Button></Link>
                    <FormsDropdown patientId={patient.id} />
                    <button onClick={() => setPatientForFiles(patient)} title="Documents & Files" className="p-2 text-zinc-400 hover:text-partners-blue-dark hover:bg-partners-blue-dark/5 rounded-xl transition-colors"><Paperclip size={16} /></button>
                    <button onClick={() => setPatientToDelete(patient.id)} title="Delete" className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {loading ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 bg-white rounded-3xl border border-zinc-200 animate-pulse"></div>)
          : filteredPatients.length === 0 ? <div className="bg-white p-12 rounded-3xl border border-zinc-200 text-center text-zinc-500">No patients found.</div>
          : filteredPatients.map(patient => (
            <div key={patient.id} className="bg-white p-4 rounded-3xl border border-zinc-200 shadow-sm space-y-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-partners-blue-dark/10 text-partners-blue-dark flex items-center justify-center font-bold">
                    {patient.first_name[0]}{patient.last_name[0]}
                  </div>
                  <div>
                    <p className="font-bold text-zinc-900">{patient.last_name}, {patient.first_name}</p>
                    <p className="text-xs text-zinc-500">ID: {patient.id.slice(0, 8)}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${patient.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>{patient.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-xs text-zinc-400 font-bold uppercase">DOB</p><p className="text-zinc-600">{parseLocalDate(patient.dob)?.toLocaleDateString() ?? '--'}</p></div>
                <div><p className="text-xs text-zinc-400 font-bold uppercase">Last Visit</p><p className="text-zinc-600">{patient.last_visit ? new Date(patient.last_visit).toLocaleDateString() : '--'}</p></div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <button onClick={() => openEditModal(patient)} className="p-2 text-zinc-400 hover:text-partners-blue-dark rounded-xl transition-colors"><Edit2 size={16} /></button>
                <Link to={`/patient-profile/${patient.id}`} className="flex-1"><Button variant="secondary" size="sm" className="w-full text-xs">Profile</Button></Link>
                <FormsDropdown patientId={patient.id} />
                <Button variant="secondary" size="sm" className="flex-none text-zinc-500 hover:text-partners-blue-dark rounded-xl px-3" onClick={() => setPatientForFiles(patient)} title="Files"><Paperclip size={16} /></Button>
                <Button variant="secondary" size="sm" className="flex-none text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl px-3" onClick={() => setPatientToDelete(patient.id)}><Trash2 size={16} /></Button>
              </div>
            </div>
          ))}
      </div>

      {/* File Upload Modal */}
      <Modal
        isOpen={!!patientForFiles}
        onClose={() => setPatientForFiles(null)}
        title={patientForFiles ? `Files — ${patientForFiles.last_name}, ${patientForFiles.first_name}` : 'Files'}
        size="lg"
      >
        <div className="p-2">
          {patientForFiles && <FileUpload patientId={patientForFiles.id} />}
        </div>
      </Modal>

      {/* Add / Edit Patient Modal */}
      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingPatient(null); resetFormState(); }}
        title={editingPatient ? 'Edit Patient' : 'Add New Patient'} size="2xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

          {/* DEMOGRAPHICS */}
          <div className="space-y-4">
            <h3 className={sectionTitle}>Demographics</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">First Name</label><input {...register('first_name')} className={inputCls} placeholder="First Name" />{errors.first_name && <p className="text-xs text-red-500">{errors.first_name.message}</p>}</div>
              <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">Last Name</label><input {...register('last_name')} className={inputCls} placeholder="Last Name" />{errors.last_name && <p className="text-xs text-red-500">{errors.last_name.message}</p>}</div>
              <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">Email</label><input {...register('email')} className={inputCls} placeholder="Email" />{errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}</div>
              <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">Preferred Name</label><input {...register('preferred_name')} className={inputCls} placeholder="Preferred Name" /></div>
              <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">Race</label><input {...register('race')} className={inputCls} placeholder="Race" /></div>
              <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">Sex</label>
                <select {...register('gender')} className={inputCls}>
                  <option value="">Select Sex</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                </select>{errors.gender && <p className="text-xs text-red-500">{errors.gender.message}</p>}</div>
              <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">Religion</label><input {...register('religion')} className={inputCls} placeholder="Religion" /></div>
              <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">Date of Birth</label>
                <div className="relative"><CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} /><input type="date" {...register('dob')} className={`${inputCls} pl-10`} /></div>
                {errors.dob && <p className="text-xs text-red-500">{errors.dob.message}</p>}</div>
              <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">Marital Status</label>
                <select {...register('marital_status')} className={inputCls}>
                  <option value="">Select Status</option><option value="Single">Single</option><option value="Married">Married</option><option value="Divorced">Divorced</option><option value="Widowed">Widowed</option>
                </select></div>
              <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">Patient Status</label>
                <select {...register('status')} className={inputCls}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
              <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">Age</label><input type="text" readOnly value={calculateAge(dob)} className="w-full px-4 py-2 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-500 outline-none" placeholder="Auto from DOB" /></div>
              <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">Primary Language</label><input {...register('primary_language')} className={inputCls} placeholder="Primary Language" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">Height</label><input {...register('height')} className={inputCls} placeholder="e.g. 5ft 10in" /></div>
                <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">Weight</label><input {...register('weight')} className={inputCls} placeholder="e.g. 160 lbs" /></div>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input type="checkbox" {...register('is_responsible_for_self')} className="w-4 h-4 rounded border-zinc-300 text-partners-blue-dark focus:ring-partners-blue-dark" />
                <label className="text-sm font-medium text-zinc-700">Is Responsible for Self</label>
              </div>
            </div>
          </div>

          {/* CENSUS SUMMARY */}
          <div className="space-y-4">
            <h3 className={sectionTitle}>Census Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { label: 'MDS Date', name: 'mds_date' }, { label: 'Start of Service', name: 'start_of_service' },
                { label: 'Last Annual Physical', name: 'last_annual_physical' },
                { label: 'Last Semi-Annual Report', name: 'last_semi_annual_report' },
                { label: 'Last Monthly Visit', name: 'last_monthly_visit' },
              ].map(f => (
                <div key={f.name} className="space-y-2"><label className="text-sm font-medium text-zinc-700">{f.label}</label><input type="date" {...register(f.name as any)} className={inputCls} /></div>
              ))}
              <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">Hospital of Choice</label><input {...register('hospital_of_choice')} className={inputCls} placeholder="Hospital Name" /></div>
              <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">MLOA Days</label><input type="number" {...register('mloa_days', { valueAsNumber: true })} className={inputCls} placeholder="0" /></div>
              <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">NMLOA Days</label><input type="number" {...register('nmloa_days', { valueAsNumber: true })} className={inputCls} placeholder="0" /></div>
            </div>
          </div>

          {/* PERSONAL INFORMATION */}
          <div className="space-y-4">
            <h3 className={sectionTitle}>Personal Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-2 md:col-span-2"><label className="text-sm font-medium text-zinc-700">Address (Street)</label><input {...register('street')} className={inputCls} placeholder="Street Address" /></div>
              {[{ label: 'Apt', name: 'apt', ph: 'Apt #' }, { label: 'City', name: 'city', ph: 'City' }, { label: 'State', name: 'state', ph: 'State' }, { label: 'Zip', name: 'zip', ph: 'Zip Code' }, { label: 'Telephone', name: 'phone', ph: 'Phone' }, { label: 'Occupation', name: 'occupation', ph: 'Occupation' }, { label: "Mother's Maiden Name", name: 'mothers_maiden_name', ph: "Mother's Maiden Name" }].map(f => (
                <div key={f.name} className="space-y-2"><label className="text-sm font-medium text-zinc-700">{f.label}</label><input {...register(f.name as any)} className={inputCls} placeholder={f.ph} /></div>
              ))}
            </div>
          </div>

          {/* PAYER INFORMATION */}
          <div className="space-y-4">
            <h3 className={sectionTitle}>Payer Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[{ label: 'Primary Payer', name: 'primary_payer', ph: 'Primary Payer Name' }, { label: 'ID Number', name: 'primary_payer_id', ph: 'ID Number' }, { label: 'SSN', name: 'ssn_encrypted', ph: 'SSN' }, { label: 'Medical Record #', name: 'insurance_id', ph: 'Medical Record #' }, { label: 'Medicare ID#', name: 'medicare_id', ph: 'Medicare ID#' }, { label: 'Medicaid ID#', name: 'medicaid_id', ph: 'Medicaid ID#' }].map(f => (
                <div key={f.name} className="space-y-2"><label className="text-sm font-medium text-zinc-700">{f.label}</label><input {...register(f.name as any)} className={inputCls} placeholder={f.ph} /></div>
              ))}
            </div>
          </div>

          {/* OTHER INSURANCE */}
          <div className="space-y-4">
            <h3 className={sectionTitle}>Other Insurance Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">Insurance</label><input {...register('other_insurance')} className={inputCls} placeholder="Insurance Name" /></div>
              <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">ID Number</label><input {...register('other_insurance_id')} className={inputCls} placeholder="ID Number" /></div>
            </div>
          </div>

          {/* RESOURCE CONTACTS */}
          <div className="space-y-4">
            <h3 className={sectionTitle}>Resource Contacts</h3>
            <div className="space-y-6">
              {[
                { title: 'Pharmacy', prefix: 'pharmacy', nameLabel: 'Pharmacy Name', namePlaceholder: 'Pharmacy Name' },
                { title: 'Transportation Company', prefix: 'transportation_company', nameLabel: 'Company Name', namePlaceholder: 'Transportation Company' },
                { title: 'Adult Day Health', prefix: 'adult_day_health', nameLabel: 'Adult Day Health', namePlaceholder: 'Adult Day Health' },
              ].map(section => (
                <div key={section.prefix} className="rounded-2xl border border-zinc-100 bg-zinc-50/60 p-4 space-y-4">
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{section.title}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-700">{section.nameLabel}</label>
                      <input {...register(`${section.prefix}_name` as any)} className={inputCls} placeholder={section.namePlaceholder} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-700">Telephone</label>
                      <input {...register(`${section.prefix}_phone` as any)} className={inputCls} placeholder="Telephone #" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-medium text-zinc-700">Address (Street)</label>
                      <input {...register(`${section.prefix}_street` as any)} className={inputCls} placeholder="Street Address" />
                    </div>
                    {[
                      { label: 'Apt', name: 'apt', ph: 'Apt #' },
                      { label: 'City', name: 'city', ph: 'City' },
                      { label: 'State', name: 'state', ph: 'State' },
                      { label: 'Zip', name: 'zip', ph: 'Zip Code' },
                    ].map(f => (
                      <div key={f.name} className="space-y-2">
                        <label className="text-sm font-medium text-zinc-700">{f.label}</label>
                        <input {...register(`${section.prefix}_${f.name}` as any)} className={inputCls} placeholder={f.ph} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ADVANCED DIRECTIVES */}
          <div className="space-y-4">
            <h3 className={sectionTitle}>Advanced Directives</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { name: 'living_will', label: 'Living Will' }, { name: 'dnr', label: 'DNR' }, { name: 'full_code', label: 'Full Code' },
                { name: 'dni', label: 'DNI' }, { name: 'organ_donation', label: 'Organ Donation' }, { name: 'dnh', label: 'DNH' },
                { name: 'autopsy_request', label: 'Autopsy Request' }, { name: 'feeding_restrictions', label: 'Feeding Restrictions' },
                { name: 'hospice', label: 'Hospice' }, { name: 'medication_restrictions', label: 'Medication Restrictions' },
                { name: 'other_treatment_restrictions', label: 'Other Treatment Restrictions' },
              ].map(f => (
                <div key={f.name} className="space-y-1">
                  <label className="text-xs font-medium text-zinc-700">{f.label}</label>
                  <select {...register(f.name as any)} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-sm focus:ring-2 focus:ring-partners-blue-dark outline-none">
                    <option value="No">No</option><option value="Yes">Yes</option><option value="Not Applicable">Not Applicable</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* PCP */}
          <div className="space-y-4">
            <h3 className={sectionTitle}>Primary Care Physician</h3>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Select PCP</label>
              <select
                value={watch('pcp_id') || ''}
                onChange={handlePcpChange}
                className={inputCls}
              >
                <option value="">Select a Provider</option>
                {medicalProviders.map(p => (
                  <option key={p.id} value={p.id}>{p.last_name}, {p.first_name} — {p.facility_name}</option>
                ))}
              </select>
              {selectedPcp && <ProviderDetailCard provider={selectedPcp} />}
              <p className="text-[10px] text-zinc-400 italic">Define providers in medical-providers and attach to patient</p>
            </div>
          </div>

          {/* OTHER PROVIDERS */}
          <div className="space-y-4">
            <h3 className={sectionTitle}>Other Provider(s)</h3>

            {selectedOtherProviders.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedOtherProviders.map(p => (
                  <span key={p.id} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-partners-blue-dark/10 text-partners-blue-dark text-xs font-medium">
                    {p.first_name} {p.last_name}
                    <button type="button" onClick={() => removeOtherProvider(p.id)} className="hover:text-red-500 transition-colors">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div ref={otherProviderRef} className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                <input
                  type="text"
                  placeholder="Search and add providers..."
                  value={otherProviderSearch}
                  onChange={e => { setOtherProviderSearch(e.target.value); setShowOtherProviderDropdown(true); }}
                  onFocus={() => setShowOtherProviderDropdown(true)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none transition-all text-sm"
                />
              </div>

              {showOtherProviderDropdown && (
                <div className="absolute z-50 mt-1 w-full bg-white rounded-2xl border border-zinc-200 shadow-xl max-h-56 overflow-y-auto">
                  {filteredOtherProviders.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-zinc-400 text-center">No providers found.</p>
                  ) : filteredOtherProviders.map(p => {
                    const isSelected = selectedOtherProviders.some(s => s.id === p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { toggleOtherProvider(p); setOtherProviderSearch(''); }}
                        className={clsx(
                          'w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors',
                          isSelected ? 'bg-partners-blue-dark/5 text-partners-blue-dark' : 'text-zinc-700 hover:bg-zinc-50'
                        )}
                      >
                        <div>
                          <span className="font-medium">{p.first_name} {p.last_name}</span>
                          <span className="text-xs text-zinc-400 ml-2">— {p.facility_name}</span>
                        </div>
                        {isSelected && <Check size={14} className="shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedOtherProviders.length > 0 && (
              <div className="space-y-3">
                {selectedOtherProviders.map(p => (
                  <ProviderDetailCard key={p.id} provider={p} />
                ))}
              </div>
            )}
          </div>

          {/* DIAGNOSES */}
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b-2 border-partners-blue-dark/20 pb-2">
              <h3 className="text-sm font-bold text-partners-blue-dark uppercase tracking-wider">Current Diagnosis</h3>
              <Button type="button" variant="ghost" size="sm" onClick={() => appendDiagnosis({ disease: '', icd10: '' })}><Plus size={16} className="mr-1" /> Add Diagnosis</Button>
            </div>
            {diagnosisFields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-zinc-50 p-4 rounded-2xl relative">
                <button type="button" onClick={() => removeDiagnosis(index)} className="absolute top-2 right-2 p-1 text-zinc-400 hover:text-red-500"><X size={16} /></button>
                <div className="space-y-2"><label className="text-xs font-medium text-zinc-700 uppercase">Disease</label><input {...register(`diagnoses.${index}.disease` as const)} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none bg-white" placeholder="Disease Name" /></div>
                <div className="space-y-2"><label className="text-xs font-medium text-zinc-700 uppercase">ICD-10 Code</label><input {...register(`diagnoses.${index}.icd10` as const)} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none bg-white" placeholder="ICD-10 Code" /></div>
              </div>
            ))}
          </div>

          {/* EMERGENCY CONTACT */}
          <div className="space-y-4">
            <h3 className={sectionTitle}>Emergency Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">Name</label><input {...register('emergency_contact_name')} className={inputCls} placeholder="Contact Name" /></div>
              <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">Phone</label><input {...register('emergency_contact_phone')} className={inputCls} placeholder="Phone" /></div>
              <div className="space-y-2"><label className="text-sm font-medium text-zinc-700">Relationship</label><input {...register('emergency_contact_relationship')} className={inputCls} placeholder="Relationship" /></div>
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2"><label className="text-sm font-medium text-zinc-700">Address (Street)</label><input {...register('emergency_contact_address.street')} className={inputCls} placeholder="Street" /></div>
                {['apt', 'city', 'state', 'zip'].map(f => (
                  <div key={f} className="space-y-2"><label className="text-sm font-medium text-zinc-700 capitalize">{f}</label><input {...register(`emergency_contact_address.${f}` as any)} className={inputCls} placeholder={f.charAt(0).toUpperCase() + f.slice(1)} /></div>
                ))}
              </div>
            </div>
          </div>

          {/* MEDICATIONS */}
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b-2 border-partners-blue-dark/20 pb-2">
              <h3 className="text-sm font-bold text-partners-blue-dark uppercase tracking-wider">Medications</h3>
              <Button type="button" variant="ghost" size="sm" onClick={() => appendMedication({ medicine: '', dosage: '', number: '', route: '', schedule: 'once a day' })}><Plus size={16} className="mr-1" /> Add Medication</Button>
            </div>
            {medicationFields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-2 md:grid-cols-5 gap-4 bg-zinc-50 p-4 rounded-2xl relative">
                <button type="button" onClick={() => removeMedication(index)} className="absolute top-2 right-2 p-1 text-zinc-400 hover:text-red-500"><X size={16} /></button>
                <div className="space-y-2"><label className="text-xs font-medium text-zinc-700 uppercase">Medicine</label><input {...register(`medications.${index}.medicine` as const)} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none bg-white" placeholder="Medicine Name" /></div>
                <div className="space-y-2"><label className="text-xs font-medium text-zinc-700 uppercase">Dosage</label><input {...register(`medications.${index}.dosage` as const)} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none bg-white" placeholder="Dosage" /></div>
                <div className="space-y-2"><label className="text-xs font-medium text-zinc-700 uppercase">Number</label><input {...register(`medications.${index}.number` as const)} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none bg-white" placeholder="Quantity / Number" /></div>
                <div className="space-y-2"><label className="text-xs font-medium text-zinc-700 uppercase">Route</label><input {...register(`medications.${index}.route` as const)} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none bg-white" placeholder="e.g. Oral, IV" /></div>
                <div className="space-y-2"><label className="text-xs font-medium text-zinc-700 uppercase">Schedule</label>
                  <select {...register(`medications.${index}.schedule` as const)} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none bg-white">
                    <option value="once a day">Once a day</option><option value="twice a day">Twice a day</option>
                    <option value="three times a day">Three times a day</option><option value="four times a day">Four times a day</option>
                    <option value="as needed">As needed</option>
                  </select>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-zinc-100">
            <Button variant="secondary" onClick={() => { setIsModalOpen(false); setEditingPatient(null); resetFormState(); }} type="button">Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : editingPatient ? 'Update Patient' : 'Add Patient'}</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={!!patientToDelete} onClose={() => setPatientToDelete(null)} title="Confirm Deletion" size="sm">
        <div className="space-y-6">
          <div className="flex items-center gap-4 p-4 bg-red-50 rounded-2xl border border-red-100">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center shrink-0"><Trash2 className="text-red-600" size={24} /></div>
            <div><p className="text-sm font-bold text-red-900">Are you sure?</p><p className="text-xs text-red-700">This action cannot be undone and will permanently delete the patient record.</p></div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setPatientToDelete(null)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDelete}>Delete Record</Button>
          </div>
        </div>
      </Modal>

      {notification && <Notification type={notification.type} message={notification.message} onClose={() => setNotification(null)} />}
    </div>
  );
};
