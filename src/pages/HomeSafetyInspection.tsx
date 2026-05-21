import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams, Link } from 'react-router-dom';
import * as z from 'zod';
import { Button } from '../components/Button';
import { Home, Send, User, Calendar, ArrowLeft, Loader2, Download } from 'lucide-react';
import { SignaturePad } from '../components/SignaturePad';
import { supabase, getFormIdByName, withTimeout } from '../services/supabase';
import { generateFormPDF } from '../services/pdfService';
import { useAuth } from '../context/AuthContext';

const FORM_NAME = 'Home Safety Inspection';

const homeSafetySchema = z.object({
  clientName: z.string().min(1, 'Required'),
  dateOfService: z.string().min(1, 'Required'),
  housingType: z.enum(['Apt', 'House']),
  subsidized: z.enum(['Yes', 'No']),
  bathroom: z.object({
    pathWellLit: z.enum(['YES', 'NO']),
    grabBars: z.enum(['YES', 'NO']),
    showerSeat: z.enum(['YES', 'NO']),
    slipResistantMats: z.enum(['YES', 'NO']),
    soapBuildupRemoved: z.enum(['YES', 'NO']),
    reachSoapEasily: z.enum(['YES', 'NO']),
    raisedToiletSeat: z.enum(['YES', 'NO']),
    spillsCleaned: z.enum(['YES', 'NO']),
  }),
  bedroom: z.object({
    tableNearBed: z.enum(['YES', 'NO']),
    lampOnTable: z.enum(['YES', 'NO']),
    pathClear: z.enum(['YES', 'NO']),
    phoneNearBed: z.enum(['YES', 'NO']),
    nightLight: z.enum(['YES', 'NO']),
    bedHeightAppropriate: z.enum(['YES', 'NO']),
    rugsSecured: z.enum(['YES', 'NO']),
    emergencyExitClear: z.enum(['YES', 'NO']),
  }),
  kitchen: z.object({
    itemsWithinReach: z.enum(['YES', 'NO']),
    stepStoolSafe: z.enum(['YES', 'NO']),
    noLooseRugs: z.enum(['YES', 'NO']),
    spillsCleaned: z.enum(['YES', 'NO']),
    fireExtinguisher: z.enum(['YES', 'NO']),
    stoveKnobsSafe: z.enum(['YES', 'NO']),
    lightingAdequate: z.enum(['YES', 'NO']),
    cordsSafe: z.enum(['YES', 'NO']),
  }),
  livingArea: z.object({
    pathsClear: z.enum(['YES', 'NO']),
    rugsSecured: z.enum(['YES', 'NO']),
    cordsOutOfWay: z.enum(['YES', 'NO']),
    lightSwitchesAccessible: z.enum(['YES', 'NO']),
    furnitureStable: z.enum(['YES', 'NO']),
    lightingAdequate: z.enum(['YES', 'NO']),
    noTrippingHazards: z.enum(['YES', 'NO']),
    handrailsOnStairs: z.enum(['YES', 'NO']),
  }),
  porchYard: z.object({
    stepsInRepair: z.enum(['YES', 'NO']),
    handrailsSturdy: z.enum(['YES', 'NO']),
    lightingAdequate: z.enum(['YES', 'NO']),
    walkwaysClear: z.enum(['YES', 'NO']),
    porchConditionGood: z.enum(['YES', 'NO']),
    noLooseBoards: z.enum(['YES', 'NO']),
    pathClearToMailbox: z.enum(['YES', 'NO']),
    noOvergrownBushes: z.enum(['YES', 'NO']),
  }),
  safetyEquipment: z.object({
    smokeDetectorsWorking: z.enum(['YES', 'NO']),
    coDetectorsWorking: z.enum(['YES', 'NO']),
    fireExtinguisherKitchen: z.enum(['YES', 'NO']),
    emergencyNumbersNearPhone: z.enum(['YES', 'NO']),
    firstAidKitAvailable: z.enum(['YES', 'NO']),
    flashlightNearBed: z.enum(['YES', 'NO']),
    emergencyCallMethod: z.enum(['YES', 'NO']),
    emergencyExitsClear: z.enum(['YES', 'NO']),
  }),
  signature: z.string().min(1, 'Signature required'),
});

type HomeSafetyFormValues = z.infer<typeof homeSafetySchema>;

export const HomeSafetyInspection: React.FC = () => {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const initialPatientId = searchParams.get('patientId');
  const editId = searchParams.get('id');

  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(initialPatientId);
  const [isFetchingPatients, setIsFetchingPatients] = useState(true);
  const [formId, setFormId] = useState<string | null>(null);
  const [isFetchingForm, setIsFetchingForm] = useState(true);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<HomeSafetyFormValues>({
    resolver: zodResolver(homeSafetySchema),
    defaultValues: {
      dateOfService: new Date().toISOString().split('T')[0],
      housingType: 'House',
      subsidized: 'No',
      bathroom: {
        pathWellLit: 'YES', grabBars: 'YES', showerSeat: 'YES',
        slipResistantMats: 'YES', soapBuildupRemoved: 'YES',
        reachSoapEasily: 'YES', raisedToiletSeat: 'YES', spillsCleaned: 'YES',
      },
      bedroom: {
        tableNearBed: 'YES', lampOnTable: 'YES', pathClear: 'YES',
        phoneNearBed: 'YES', nightLight: 'YES', bedHeightAppropriate: 'YES',
        rugsSecured: 'YES', emergencyExitClear: 'YES',
      },
      kitchen: {
        itemsWithinReach: 'YES', stepStoolSafe: 'YES', noLooseRugs: 'YES',
        spillsCleaned: 'YES', fireExtinguisher: 'YES', stoveKnobsSafe: 'YES',
        lightingAdequate: 'YES', cordsSafe: 'YES',
      },
      livingArea: {
        pathsClear: 'YES', rugsSecured: 'YES', cordsOutOfWay: 'YES',
        lightSwitchesAccessible: 'YES', furnitureStable: 'YES',
        lightingAdequate: 'YES', noTrippingHazards: 'YES', handrailsOnStairs: 'YES',
      },
      porchYard: {
        stepsInRepair: 'YES', handrailsSturdy: 'YES', lightingAdequate: 'YES',
        walkwaysClear: 'YES', porchConditionGood: 'YES', noLooseBoards: 'YES',
        pathClearToMailbox: 'YES', noOvergrownBushes: 'YES',
      },
      safetyEquipment: {
        smokeDetectorsWorking: 'YES', coDetectorsWorking: 'YES',
        fireExtinguisherKitchen: 'YES', emergencyNumbersNearPhone: 'YES',
        firstAidKitAvailable: 'YES', flashlightNearBed: 'YES',
        emergencyCallMethod: 'YES', emergencyExitsClear: 'YES',
      },
    },
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
          if (data && !error) reset(data.data);
        } catch (err) {
          console.error('HomeSafetyInspection: Error fetching submission:', err);
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

    const fetchPatients = async () => {
      try {
        const { data, error } = await supabase
          .from('patients')
          .select('id, first_name, last_name')
          .eq('is_active', true)
          .order('last_name', { ascending: true });
        if (data && !error) setPatients(data);
      } finally {
        setIsFetchingPatients(false);
      }
    };

    fetchFormId();
    fetchPatients();
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      const fetchPatient = async () => {
        const { data, error } = await supabase
          .from('patients')
          .select('first_name, last_name')
          .eq('id', selectedPatientId)
          .single();
        if (data && !error) {
          setValue('clientName', `${data.first_name} ${data.last_name}`);
        }
      };
      fetchPatient();
    }
  }, [selectedPatientId, setValue]);

  const onSubmit = async (data: HomeSafetyFormValues) => {
    if (!profile) {
      alert('You must be logged in to submit forms.');
      return;
    }
    try {
      let currentFormId = formId;
      if (!currentFormId) {
        currentFormId = (await withTimeout(getFormIdByName(FORM_NAME))) as any;
        if (!currentFormId) {
          throw new Error(`The "${FORM_NAME}" form is missing from the database.`);
        }
        setFormId(currentFormId);
      }

      const { data: responseData, error: responseError } = await supabase
        .from('form_responses')
        .insert([{
          form_id: currentFormId,
          patient_id: selectedPatientId || '00000000-0000-0000-0000-000000000000',
          staff_id: profile.id,
          data: data,
          status: 'submitted',
        }])
        .select()
        .single();

      if (responseError) throw responseError;

      if (data.signature) {
        await supabase
          .from('signatures')
          .insert([{
            parent_id: responseData.id,
            parent_type: 'form_response',
            signer_id: profile.id,
            signature_data: data.signature,
          }]);
      }

      alert('Home Safety Inspection submitted successfully!');
      reset();
    } catch (error: any) {
      console.error('Error submitting form:', error);
      alert(`Error: ${error.message}`);
    }
  };

  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  const handlePrint = async () => {
    try {
      setIsGeneratingPDF(true);
      const formData = getValues();
      const success = await generateFormPDF(FORM_NAME, formData);
      if (!success && formRef.current) {
        const { exportToPDF } = await import('../utils/pdfGenerator');
        await exportToPDF(
          formRef.current,
          `Home_Safety_Inspection_${new Date().toISOString().split('T')[0]}.pdf`,
        );
      }
    } catch (error) {
      console.error('PDF error:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const QuestionRow = ({
    section,
    field,
    label,
  }: {
    section: keyof HomeSafetyFormValues;
    field: string;
    label: string;
  }) => (
    <div className="flex items-center justify-between py-3 border-b border-zinc-100 last:border-0">
      <span className="text-sm text-zinc-700 pr-4">{label}</span>
      <div className="flex gap-4 shrink-0">
        <label className="flex items-center gap-2 cursor-pointer group">
          <input
            type="radio"
            value="YES"
            {...register(`${section}.${field}` as any)}
            className="w-4 h-4 text-partners-blue border-zinc-300 focus:ring-partners-blue/20"
          />
          <span className="text-xs font-medium text-zinc-500 group-hover:text-zinc-900 transition-colors">YES</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer group">
          <input
            type="radio"
            value="NO"
            {...register(`${section}.${field}` as any)}
            className="w-4 h-4 text-red-500 border-zinc-300 focus:ring-red-500/20"
          />
          <span className="text-xs font-medium text-zinc-500 group-hover:text-zinc-900 transition-colors">NO</span>
        </label>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-8">
      <Link
        to="/clinical-forms"
        className="flex items-center gap-2 text-zinc-500 hover:text-partners-blue-dark transition-colors mb-6 group no-print"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-sm font-medium">Back to Forms</span>
      </Link>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-partners-blue-dark flex items-center gap-2">
            <Home className="text-partners-green" />
            Home Safety Inspection
          </h2>
          <p className="text-partners-gray">
            Evaluate the patient's living environment for safety hazards.
          </p>
        </div>
        <div className="flex gap-3 no-print">
          <Button variant="secondary" onClick={handlePrint} disabled={isGeneratingPDF}>
            {isGeneratingPDF ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            {isGeneratingPDF ? 'Generating...' : 'Download PDF'}
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
            <Send className="w-4 h-4 mr-2" />
            {isSubmitting ? 'Submitting...' : 'Submit Inspection'}
          </Button>
        </div>
      </div>

      <form
        ref={formRef}
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-8 bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700 flex items-center gap-2">
              <User size={16} className="text-zinc-400" />
              Select Patient
            </label>
            <select
              value={selectedPatientId || ''}
              onChange={(e) => setSelectedPatientId(e.target.value || null)}
              className="w-full px-4 py-2 rounded-xl border border-zinc-200 bg-white outline-none focus:ring-2 focus:ring-partners-blue-dark/20 transition-all"
              required
            >
              <option value="">-- Select a Patient --</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.last_name}, {p.first_name}
                </option>
              ))}
            </select>
            {patients.length === 0 && !isFetchingPatients && (
              <p className="text-[10px] text-red-500 mt-1 italic">
                No patients found in the database. Please add patients in the Patient Management section first.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700 flex items-center gap-2">
              <User size={16} className="text-zinc-400" />
              Client Name
            </label>
            <input
              {...register('clientName')}
              readOnly
              className="w-full px-4 py-2 rounded-xl border border-zinc-200 bg-zinc-50 outline-none"
            />
            {errors.clientName && (
              <p className="text-xs text-red-500">{errors.clientName.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700 flex items-center gap-2">
              <Calendar size={16} className="text-zinc-400" />
              Date of Service
            </label>
            <input
              type="date"
              {...register('dateOfService')}
              className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-zinc-50 rounded-xl">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Housing Type</label>
            <div className="flex gap-4">
              {['Apt', 'House'].map((v) => (
                <label key={v} className="flex items-center gap-2">
                  <input type="radio" value={v} {...register('housingType')} className="w-4 h-4" />
                  <span className="text-sm">{v}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Subsidized?</label>
            <div className="flex gap-4">
              {['Yes', 'No'].map((v) => (
                <label key={v} className="flex items-center gap-2">
                  <input type="radio" value={v} {...register('subsidized')} className="w-4 h-4" />
                  <span className="text-sm">{v}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <section>
            <h3 className="text-lg font-bold text-partners-blue-dark mb-4 border-b pb-2">Bathroom</h3>
            <QuestionRow section="bathroom" field="pathWellLit"        label="Is the path from the bedroom to the bathroom well lit?" />
            <QuestionRow section="bathroom" field="grabBars"           label="Are there grab bars near the toilet and in the shower and bathtub?" />
            <QuestionRow section="bathroom" field="showerSeat"         label="If you have difficulty standing in the shower, do you use a shower seat?" />
            <QuestionRow section="bathroom" field="slipResistantMats"  label="Do your bathmats have slip resistant backing?" />
            <QuestionRow section="bathroom" field="soapBuildupRemoved" label="Do you remove soap buildup in your shower?" />
            <QuestionRow section="bathroom" field="reachSoapEasily"    label="Can you reach soap in the shower without bending down or turning too far around?" />
            <QuestionRow section="bathroom" field="raisedToiletSeat"   label="Do you have a raised toilet seat if you have difficulty standing up or sitting down?" />
            <QuestionRow section="bathroom" field="spillsCleaned"      label="Are spills cleaned up immediately?" />
          </section>

          <section>
            <h3 className="text-lg font-bold text-partners-blue-dark mb-4 border-b pb-2">Bedroom</h3>
            <QuestionRow section="bedroom" field="tableNearBed"         label="Is there a table close to your bed?" />
            <QuestionRow section="bedroom" field="lampOnTable"          label="Is there a lamp on the table within easy reach?" />
            <QuestionRow section="bedroom" field="pathClear"            label="Is the path from your bed to the bathroom clear of obstacles?" />
            <QuestionRow section="bedroom" field="phoneNearBed"         label="Is there a telephone close to your bed?" />
            <QuestionRow section="bedroom" field="nightLight"           label="Do you use a night light?" />
            <QuestionRow section="bedroom" field="bedHeightAppropriate" label="Is your bed height appropriate for easy entry and exit?" />
            <QuestionRow section="bedroom" field="rugsSecured"          label="Are all rugs in the bedroom secured to the floor?" />
            <QuestionRow section="bedroom" field="emergencyExitClear"   label="Is the emergency exit from the bedroom clear?" />
          </section>

          <section>
            <h3 className="text-lg font-bold text-partners-blue-dark mb-4 border-b pb-2">Kitchen</h3>
            <QuestionRow section="kitchen" field="itemsWithinReach" label="Are items you use often on low shelves?" />
            <QuestionRow section="kitchen" field="stepStoolSafe"    label="If you use a step stool, is it steady and does it have a handrail?" />
            <QuestionRow section="kitchen" field="noLooseRugs"      label="Are there any loose rugs or mats?" />
            <QuestionRow section="kitchen" field="spillsCleaned"    label="Are spills cleaned up immediately?" />
            <QuestionRow section="kitchen" field="fireExtinguisher" label="Is there a fire extinguisher nearby?" />
            <QuestionRow section="kitchen" field="stoveKnobsSafe"   label="Are stove knobs easy to read and turn?" />
            <QuestionRow section="kitchen" field="lightingAdequate" label="Is the lighting adequate?" />
            <QuestionRow section="kitchen" field="cordsSafe"        label="Are electrical cords in good condition?" />
          </section>

          <section>
            <h3 className="text-lg font-bold text-partners-blue-dark mb-4 border-b pb-2">Living Area</h3>
            <QuestionRow section="livingArea" field="pathsClear"              label="Are there clear paths through the rooms?" />
            <QuestionRow section="livingArea" field="rugsSecured"             label="Are there any loose rugs or mats?" />
            <QuestionRow section="livingArea" field="cordsOutOfWay"           label="Are electrical cords out of the way?" />
            <QuestionRow section="livingArea" field="lightSwitchesAccessible" label="Is there a light switch at the entrance to each room?" />
            <QuestionRow section="livingArea" field="furnitureStable"         label="Are chairs and sofas easy to get in and out of?" />
            <QuestionRow section="livingArea" field="lightingAdequate"        label="Is the lighting adequate?" />
            <QuestionRow section="livingArea" field="noTrippingHazards"       label="Are there any tripping hazards?" />
            <QuestionRow section="livingArea" field="handrailsOnStairs"       label="Are there handrails on any stairs?" />
          </section>

          <section>
            <h3 className="text-lg font-bold text-partners-blue-dark mb-4 border-b pb-2">Porch/Yard</h3>
            <QuestionRow section="porchYard" field="stepsInRepair"      label="Are steps in good repair?" />
            <QuestionRow section="porchYard" field="handrailsSturdy"    label="Are there sturdy handrails on both sides of the steps?" />
            <QuestionRow section="porchYard" field="lightingAdequate"   label="Is there adequate lighting at the entrance?" />
            <QuestionRow section="porchYard" field="walkwaysClear"      label="Are walkways clear of debris and tripping hazards?" />
            <QuestionRow section="porchYard" field="porchConditionGood" label="Is the porch or deck in good condition?" />
            <QuestionRow section="porchYard" field="noLooseBoards"      label="Are there any loose boards or railings?" />
            <QuestionRow section="porchYard" field="pathClearToMailbox" label="Is there a clear path to the mailbox or trash area?" />
            <QuestionRow section="porchYard" field="noOvergrownBushes"  label="Are there any overgrown bushes or trees blocking paths?" />
          </section>

          <section>
            <h3 className="text-lg font-bold text-partners-blue-dark mb-4 border-b pb-2">Safety Equipment</h3>
            <QuestionRow section="safetyEquipment" field="smokeDetectorsWorking"     label="Are there working smoke detectors on every level?" />
            <QuestionRow section="safetyEquipment" field="coDetectorsWorking"        label="Are there working carbon monoxide detectors?" />
            <QuestionRow section="safetyEquipment" field="fireExtinguisherKitchen"   label="Is there a fire extinguisher in the kitchen?" />
            <QuestionRow section="safetyEquipment" field="emergencyNumbersNearPhone" label="Do you have a list of emergency numbers near the phone?" />
            <QuestionRow section="safetyEquipment" field="firstAidKitAvailable"      label="Do you have a first aid kit?" />
            <QuestionRow section="safetyEquipment" field="flashlightNearBed"         label="Is there a flashlight with working batteries near your bed?" />
            <QuestionRow section="safetyEquipment" field="emergencyCallMethod"       label="Do you have a way to call for help in an emergency?" />
            <QuestionRow section="safetyEquipment" field="emergencyExitsClear"       label="Are emergency exits clear?" />
          </section>
        </div>

        <section className="pt-8 border-t border-zinc-200">
          <div className="max-w-md">
            <SignaturePad
              label="Inspector Signature"
              onSave={(sig) => setValue('signature', sig, { shouldValidate: true })}
              initialValue={watch('signature')}
            />
            {errors.signature && (
              <p className="text-xs text-red-500 mt-1">{errors.signature.message}</p>
            )}
          </div>
        </section>
      </form>
    </div>
  );
};
