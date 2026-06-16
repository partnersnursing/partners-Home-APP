import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams, Link } from 'react-router-dom';
import * as z from 'zod';
import { Button } from '../components/Button';
import { ClipboardCheck, Send, User, Brain, HeartPulse, Activity, ArrowLeft, Loader2, Download, Plus, Trash2, Home, Shield, Stethoscope, Users, CheckCircle, AlertCircle, X } from 'lucide-react';
import { clsx } from 'clsx';
import { supabase, getFormIdByName, withTimeout } from '../services/supabase';
import { generateFormPDF } from '../services/pdfService';
import { useAuth } from '../context/AuthContext';

const FORM_NAME = 'MDS Assessment';

const mdsSchema = z.object({
  assessmentDate: z.string().min(1, 'Required'),
  caseRecordNo: z.string().min(1, 'Required'),
  ssn: z.string().min(1, 'Required'),
  medicareId: z.string().min(1, 'Required'),
  patient: z.object({
    name: z.string().min(1, 'Required'),
    dob: z.string().min(1, 'Required'),
    gender: z.enum(['Male', 'Female']),
    maritalStatus: z.string().optional(),
    primaryLanguage: z.string().optional(),
    education: z.string().optional(),
    ethnicityHispanic: z.boolean().optional(),
    race: z.array(z.string()).optional(),
  }),
  responsibility: z.object({
    legalGuardian: z.boolean().optional(),
    advancedDirectives: z.boolean().optional(),
  }).optional(),
  assessmentReason: z.string().min(1, 'Required'),
  referral: z.object({
    dateOpened: z.string().min(1, 'Required'),
    referralReason: z.string().optional(),
    goalsOfCare: z.object({
      skilledNursing: z.boolean().optional(),
      monitoring: z.boolean().optional(),
      rehabilitation: z.boolean().optional(),
      education: z.boolean().optional(),
      respite: z.boolean().optional(),
      palliative: z.boolean().optional(),
    }).optional(),
    timeSinceHospital: z.string().optional(),
    whereLivedAtReferral: z.string().optional(),
    whoLivedWithAtReferral: z.string().optional(),
    priorNHPlacement: z.boolean().optional(),
    residentialHistory: z.boolean().optional(),
  }),
  cognitive: z.object({
    memory: z.object({
      shortTerm: z.enum(['Memory OK', 'Memory problem']).optional(),
      procedural: z.enum(['Memory OK', 'Memory problem']).optional(),
    }).optional(),
    decisionMaking: z.enum(['Independent', 'Modified Independent', 'Minimally Impaired', 'Moderately Impaired', 'Severely Impaired']),
    decisionMakingDecline: z.boolean().optional(),
    delirium: z.object({
      suddenOnset: z.boolean().optional(),
      agitatedDisoriented: z.boolean().optional(),
    }).optional(),
  }),
  communication: z.object({
    hearing: z.string().min(1, 'Required'),
    makingSelfUnderstood: z.string().optional(),
    abilityToUnderstandOthers: z.string().optional(),
    communicationDecline: z.boolean().optional(),
  }),
  vision: z.object({
    vision: z.string().min(1, 'Required'),
    visualLimitations: z.boolean().optional(),
    visionDecline: z.boolean().optional(),
  }),
  mood: z.object({
    indicators: z.object({
      sadness: z.number().min(0),
      anger: z.number().min(0),
      unrealisticFears: z.number().min(0),
      repetitiveHealthComplaints: z.number().min(0),
      repetitiveAnxiousComplaints: z.number().min(0),
      facialExpressions: z.number().min(0),
      crying: z.number().min(0),
      withdrawal: z.number().min(0),
      reducedSocialInteraction: z.number().min(0),
    }),
    moodDecline: z.boolean().optional(),
    behavioralSymptoms: z.object({
      wandering: z.number().optional(),
      verballyAbusive: z.number().optional(),
      physicallyAbusive: z.number().optional(),
      sociallyInappropriate: z.number().optional(),
      resistsCare: z.number().optional(),
    }).optional(),
    behavioralSymptomsDecline: z.boolean().optional(),
  }),
  social: z.object({
    involvement: z.object({
      atEase: z.enum(['At ease', 'Not at ease']).optional(),
      expressesConflict: z.boolean().optional(),
    }).optional(),
    socialActivitiesChange: z.string().optional(),
    isolation: z.object({
      timeAlone: z.string().optional(),
      feelsLonely: z.boolean().optional(),
    }).optional(),
  }).optional(),
  informalSupport: z.object({
    helpers: z.object({
      primary: z.object({
        name: z.string().optional(),
        livesWith: z.boolean().optional(),
        relationship: z.string().optional(),
        advice: z.boolean().optional(),
        iadl: z.boolean().optional(),
        adl: z.boolean().optional(),
        willingnessToIncrease: z.string().optional(),
      }).optional(),
      secondary: z.object({
        name: z.string().optional(),
        livesWith: z.boolean().optional(),
        relationship: z.string().optional(),
        advice: z.boolean().optional(),
        iadl: z.boolean().optional(),
        adl: z.boolean().optional(),
        willingnessToIncrease: z.string().optional(),
      }).optional(),
    }).optional(),
    caregiverStatus: z.object({
      unableToContinue: z.boolean().optional(),
      notSatisfied: z.boolean().optional(),
      expressesDistress: z.boolean().optional(),
      noneOfAbove: z.boolean().optional(),
    }).optional(),
    informalHelpExtent: z.object({
      weekdayHours: z.string().optional(),
      weekendHours: z.string().optional(),
    }).optional(),
  }).optional(),
  physical: z.object({
    iadl: z.object({
      mealPrep: z.object({ performance: z.string().min(1), difficulty: z.string().min(1) }),
      housework: z.object({ performance: z.string().min(1), difficulty: z.string().min(1) }),
      finance: z.object({ performance: z.string().min(1), difficulty: z.string().min(1) }),
      meds: z.object({ performance: z.string().min(1), difficulty: z.string().min(1) }),
      phone: z.object({ performance: z.string().min(1), difficulty: z.string().min(1) }),
      shopping: z.object({ performance: z.string().min(1), difficulty: z.string().min(1) }),
      transport: z.object({ performance: z.string().min(1), difficulty: z.string().min(1) }),
    }),
    adl: z.object({
      mobilityInBed: z.string().min(1),
      transfer: z.string().min(1),
      locomotionInHome: z.string().min(1),
      locomotionOutsideHome: z.string().min(1),
      dressingUpperBody: z.string().min(1),
      dressingLowerBody: z.string().min(1),
      eating: z.string().min(1),
      toiletUse: z.string().min(1),
      personalHygiene: z.string().min(1),
      bathing: z.string().min(1),
    }),
    adlDecline: z.boolean().optional(),
    locomotionModes: z.object({
      indoors: z.string().optional(),
      outdoors: z.string().optional(),
    }).optional(),
    stairClimbing: z.string().optional(),
    stamina: z.object({
      daysWentOut: z.string().optional(),
      hoursPhysicalActivity: z.string().optional(),
    }).optional(),
    functionalPotential: z.object({
      increasedIndependence: z.boolean().optional(),
      caregiverBelief: z.boolean().optional(),
      prospectsOfRecovery: z.boolean().optional(),
      noneOfAbove: z.boolean().optional(),
    }).optional(),
  }),
  continence: z.object({
    bladderContinence: z.string().optional(),
    bladderDecline: z.boolean().optional(),
    bladderDevices: z.object({
      pads: z.boolean().optional(),
      catheter: z.boolean().optional(),
      none: z.boolean().optional(),
    }).optional(),
    bowelContinence: z.string().optional(),
  }).optional(),
  diagnoses: z.object({
    heart: z.array(z.string()).optional(),
    neuro: z.array(z.string()).optional(),
    musculo: z.array(z.string()).optional(),
    senses: z.array(z.string()).optional(),
    psych: z.array(z.string()).optional(),
    infections: z.array(z.string()).optional(),
    other: z.array(z.string()).optional(),
    otherDiagnoses: z.array(z.object({
      name: z.string(),
      icd: z.string(),
    })).optional(),
  }),
  healthConditions: z.object({
    preventiveHealth: z.object({
      bpMeasured: z.boolean().optional(),
      fluVaccine: z.boolean().optional(),
      bloodInStool: z.boolean().optional(),
      breastExam: z.boolean().optional(),
      noneOfAbove: z.boolean().optional(),
    }).optional(),
    problemConditions2Days: z.object({
      diarrhea: z.boolean().optional(),
      difficultyUrinating: z.boolean().optional(),
      fever: z.boolean().optional(),
      lossOfAppetite: z.boolean().optional(),
      vomiting: z.boolean().optional(),
      noneOfAbove: z.boolean().optional(),
    }).optional(),
    problemConditions3Days: z.object({
      chestPain: z.boolean().optional(),
      noBowelMovement: z.boolean().optional(),
      dizziness: z.boolean().optional(),
      edema: z.boolean().optional(),
      shortnessOfBreath: z.boolean().optional(),
      delusions: z.boolean().optional(),
      hallucinations: z.boolean().optional(),
      noneOfAbove: z.boolean().optional(),
    }).optional(),
    pain: z.object({
      frequency: z.string().optional(),
      intensity: z.string().optional(),
      disruptsActivities: z.boolean().optional(),
      character: z.string().optional(),
      medicationControl: z.string().optional(),
    }).optional(),
    fallsFrequency: z.string().optional(),
    dangerOfFall: z.object({
      unsteadyGait: z.boolean().optional(),
      limitsGoingOutdoors: z.boolean().optional(),
    }).optional(),
    lifestyle: z.object({
      drinkingConcern: z.boolean().optional(),
      eyeOpener: z.boolean().optional(),
      smoking: z.boolean().optional(),
    }).optional(),
    healthStatusIndicators: z.object({
      poorHealth: z.boolean().optional(),
      unstableConditions: z.boolean().optional(),
      flareUp: z.boolean().optional(),
      treatmentsChanged: z.boolean().optional(),
      prognosis: z.boolean().optional(),
      noneOfAbove: z.boolean().optional(),
    }).optional(),
    otherStatusIndicators: z.object({
      fearful: z.boolean().optional(),
      poorHygiene: z.boolean().optional(),
      unexplainedInjuries: z.boolean().optional(),
      neglectedAbused: z.boolean().optional(),
      physicallyRestrained: z.boolean().optional(),
      noneOfAbove: z.boolean().optional(),
    }).optional(),
    problems: z.object({
      falls: z.boolean().optional(),
      unsteadyGait: z.boolean().optional(),
      dizziness: z.boolean().optional(),
      edema: z.boolean().optional(),
      shortnessOfBreath: z.boolean().optional(),
      chestPain: z.boolean().optional(),
      vomiting: z.boolean().optional(),
      dehydration: z.boolean().optional(),
    }).optional(),
    selfReportedHealth: z.string().optional(),
  }).optional(),
  nutrition: z.object({
    weight: z.object({
      unintendedLoss: z.boolean().optional(),
      severeMalnutrition: z.boolean().optional(),
      morbidObesity: z.boolean().optional(),
    }).optional(),
    consumption: z.object({
      fewMeals: z.boolean().optional(),
      noticeableDecrease: z.boolean().optional(),
      insufficientFluid: z.boolean().optional(),
      enteralTube: z.boolean().optional(),
    }).optional(),
    swallowing: z.string().optional(),
    problems: z.object({
      weightLoss: z.boolean().optional(),
      dehydration: z.boolean().optional(),
      poorAppetite: z.boolean().optional(),
      swallowingProblem: z.boolean().optional(),
    }).optional(),
    height: z.string().optional(),
    weightVal: z.string().optional(),
    drinking: z.string().optional(),
  }).optional(),
  dental: z.object({
    oralStatus: z.object({
      chewingProblem: z.boolean().optional(),
      dryMouth: z.boolean().optional(),
      brushingProblem: z.boolean().optional(),
      noneOfAbove: z.boolean().optional(),
    }).optional(),
  }).optional(),
  skin: z.object({
    skinProblems: z.boolean().optional(),
    ulcers: z.object({
      highestStage: z.string().optional(),
      pressureUlcer: z.boolean().optional(),
      stasisUlcer: z.boolean().optional(),
    }).optional(),
    otherSkinProblems: z.object({
      burns: z.boolean().optional(),
      openLesions: z.boolean().optional(),
      skinTears: z.boolean().optional(),
      surgicalWound: z.boolean().optional(),
      cornsCalluses: z.boolean().optional(),
      noneOfAbove: z.boolean().optional(),
    }).optional(),
    historyOfResolvedUlcers: z.boolean().optional(),
    woundCare: z.object({
      antibiotics: z.boolean().optional(),
      dressings: z.boolean().optional(),
      surgicalWoundCare: z.boolean().optional(),
      other: z.boolean().optional(),
      noneOfAbove: z.boolean().optional(),
    }).optional(),
  }).optional(),
  environmental: z.object({
    homeEnvironment: z.object({
      lighting: z.boolean().optional(),
      flooring: z.boolean().optional(),
      bathroom: z.boolean().optional(),
      kitchen: z.boolean().optional(),
      heating: z.boolean().optional(),
      personalSafety: z.boolean().optional(),
      accessToHome: z.boolean().optional(),
      accessToRooms: z.boolean().optional(),
      noneOfAbove: z.boolean().optional(),
    }).optional(),
    livingArrangement: z.object({
      livesWithOthers: z.boolean().optional(),
      betterOffElsewhere: z.string().optional(),
    }).optional(),
  }).optional(),
  serviceUtilization: z.object({
    formalCare: z.array(z.object({
      service: z.string(),
      days: z.string(),
      hours: z.string(),
      mins: z.string(),
    })).optional(),
    specialTreatments: z.object({
      oxygen: z.string().optional(),
      respirator: z.string().optional(),
      otherRespiratory: z.string().optional(),
      alcoholDrug: z.string().optional(),
      bloodTransfusion: z.string().optional(),
      chemotherapy: z.string().optional(),
      dialysis: z.string().optional(),
      ivInfusionCentral: z.string().optional(),
      ivInfusionPeripheral: z.string().optional(),
      medicationInjection: z.string().optional(),
      ostomyCare: z.string().optional(),
      radiation: z.string().optional(),
      tracheostomyCare: z.string().optional(),
      exerciseTherapy: z.string().optional(),
      occupationalTherapy: z.string().optional(),
      physicalTherapy: z.string().optional(),
      dayCenter: z.string().optional(),
      dayHospital: z.string().optional(),
      hospiceCare: z.string().optional(),
      physicianClinicVisit: z.string().optional(),
      respiteCare: z.string().optional(),
      nurseMonitoringDaily: z.string().optional(),
      nurseMonitoringLessDaily: z.string().optional(),
      medicalAlert: z.string().optional(),
      skinTreatment: z.string().optional(),
      specialDiet: z.string().optional(),
      noneOfAbove: z.boolean().optional(),
    }).optional(),
    managementOfEquipment: z.object({
      oxygen: z.string().optional(),
      iv: z.string().optional(),
      catheter: z.string().optional(),
      ostomy: z.string().optional(),
    }).optional(),
    visitsLast90Days: z.object({
      hospitalAdmissions: z.string().optional(),
      erVisits: z.string().optional(),
      emergentCare: z.string().optional(),
    }).optional(),
    hospitalUse: z.object({
      inpatientStays: z.string().optional(),
      erVisits: z.string().optional(),
    }).optional(),
    physicianVisits: z.string().optional(),
    treatmentGoalsMet: z.boolean().optional(),
    overallChangeInCareNeeds: z.string().optional(),
    tradeOffs: z.boolean().optional(),
  }).optional(),
  medications: z.object({
    numberOfMedications: z.string().optional(),
    receiptOfPsychotropic: z.object({
      antipsychotic: z.boolean().optional(),
      anxiolytic: z.boolean().optional(),
      antidepressant: z.boolean().optional(),
      hypnotic: z.boolean().optional(),
    }).optional(),
    medicalOversight: z.string().optional(),
    complianceAdherence: z.string().optional(),
    medicationList: z.array(z.object({
      name: z.string(),
      dose: z.string(),
      form: z.string(),
      freq: z.string(),
    })).optional(),
  }),
  summary: z.string().optional(),
  signatures: z.array(z.object({
    signature: z.string(),
    title: z.string(),
    sections: z.string(),
    date: z.string(),
  })).optional(),
});

type MDSFormValues = z.infer<typeof mdsSchema>;

export const MDSAssessment: React.FC = () => {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const [selectedPatientId, setSelectedPatientId] = useState<string>(searchParams.get('patientId') || '');
  const editId = searchParams.get('id');
  const [patients, setPatients] = useState<any[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(true);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const { register, handleSubmit, setValue, watch, reset, getValues, formState: { errors, isSubmitting }, control } = useForm<MDSFormValues>({
    resolver: zodResolver(mdsSchema),
    defaultValues: {
      assessmentDate: new Date().toISOString().split('T')[0],
      patient: { race: [] },
      responsibility: { legalGuardian: false, advancedDirectives: false },
      referral: {
        goalsOfCare: {
          skilledNursing: false,
          monitoring: false,
          rehabilitation: false,
          education: false,
          respite: false,
          palliative: false
        },
        priorNHPlacement: false,
        residentialHistory: false
      },
      cognitive: {
        memory: {},
        delirium: { suddenOnset: false, agitatedDisoriented: false }
      },
      communication: { communicationDecline: false },
      vision: { visualLimitations: false, visionDecline: false },
      mood: {
        indicators: {},
        moodDecline: false,
        behavioralSymptoms: {},
        behavioralSymptomsDecline: false
      },
      social: {
        involvement: { expressesConflict: false },
        isolation: { feelsLonely: false }
      },
      informalSupport: {
        helpers: {
          primary: { advice: false, iadl: false, adl: false },
          secondary: { advice: false, iadl: false, adl: false }
        },
        caregiverStatus: {
          unableToContinue: false,
          notSatisfied: false,
          expressesDistress: false,
          noneOfAbove: false
        }
      },
      physical: {
        iadl: {},
        adl: {},
        adlDecline: false,
        locomotionModes: {},
        stamina: {},
        functionalPotential: {
          increasedIndependence: false,
          caregiverBelief: false,
          prospectsOfRecovery: false,
          noneOfAbove: false
        }
      },
      continence: {
        bladderDecline: false,
        bladderDevices: { pads: false, catheter: false, none: false }
      },
      diagnoses: {
        heart: [],
        neuro: [],
        musculo: [],
        senses: [],
        psych: [],
        infections: [],
        other: [],
        otherDiagnoses: []
      },
      healthConditions: {
        preventiveHealth: {
          bpMeasured: false,
          fluVaccine: false,
          bloodInStool: false,
          breastExam: false,
          noneOfAbove: false
        },
        problemConditions2Days: {
          diarrhea: false,
          difficultyUrinating: false,
          fever: false,
          lossOfAppetite: false,
          vomiting: false,
          noneOfAbove: false
        },
        problemConditions3Days: {
          chestPain: false,
          noBowelMovement: false,
          dizziness: false,
          edema: false,
          shortnessOfBreath: false,
          delusions: false,
          hallucinations: false,
          noneOfAbove: false
        },
        dangerOfFall: { unsteadyGait: false, limitsGoingOutdoors: false },
        lifestyle: { drinkingConcern: false, eyeOpener: false, smoking: false },
        healthStatusIndicators: {
          poorHealth: false,
          unstableConditions: false,
          flareUp: false,
          treatmentsChanged: false,
          prognosis: false,
          noneOfAbove: false
        },
        otherStatusIndicators: {
          fearful: false,
          poorHygiene: false,
          unexplainedInjuries: false,
          neglectedAbused: false,
          physicallyRestrained: false,
          noneOfAbove: false
        }
      },
      nutrition: {
        weight: { unintendedLoss: false, severeMalnutrition: false, morbidObesity: false },
        consumption: { fewMeals: false, noticeableDecrease: false, insufficientFluid: false, enteralTube: false }
      },
      dental: {
        oralStatus: { chewingProblem: false, dryMouth: false, brushingProblem: false, noneOfAbove: false }
      },
      skin: {
        skinProblems: false,
        ulcers: { pressureUlcer: false, stasisUlcer: false },
        otherSkinProblems: {
          burns: false,
          openLesions: false,
          skinTears: false,
          surgicalWound: false,
          cornsCalluses: false,
          noneOfAbove: false
        },
        historyOfResolvedUlcers: false,
        woundCare: {
          antibiotics: false,
          dressings: false,
          surgicalWoundCare: false,
          other: false,
          noneOfAbove: false
        }
      },
      environmental: {
        homeEnvironment: {
          lighting: false,
          flooring: false,
          bathroom: false,
          kitchen: false,
          heating: false,
          personalSafety: false,
          accessToHome: false,
          accessToRooms: false,
          noneOfAbove: false
        },
        livingArrangement: { livesWithOthers: false }
      },
      serviceUtilization: {
        formalCare: [],
        specialTreatments: { noneOfAbove: false },
        managementOfEquipment: {},
        visitsLast90Days: {},
        treatmentGoalsMet: false,
        tradeOffs: false
      },
      medications: {
        receiptOfPsychotropic: {
          antipsychotic: false,
          anxiolytic: false,
          antidepressant: false,
          hypnotic: false
        },
        medicationList: []
      },
      signatures: []
    }
  });

  const { fields: medFields, append: appendMed, remove: removeMed } = useFieldArray({
    control,
    name: "medications.medicationList"
  });

  const { fields: careFields, append: appendCare, remove: removeCare } = useFieldArray({
    control,
    name: "serviceUtilization.formalCare"
  });

  const { fields: diagFields, append: appendDiag, remove: removeDiag } = useFieldArray({
    control,
    name: "diagnoses.otherDiagnoses"
  });

  const { fields: sigFields, append: appendSig, remove: removeSig } = useFieldArray({
    control,
    name: "signatures"
  });

  const [formId, setFormId] = useState<string | null>(null);
  const [isFetchingForm, setIsFetchingForm] = useState(true);

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const { data, error } = await supabase
          .from('patients')
          .select('id, first_name, last_name')
          .order('last_name', { ascending: true });
        
        if (data && !error) {
          setPatients(data);
        }
      } finally {
        setIsLoadingPatients(false);
      }
    };
    fetchPatients();
  }, []);

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
    if (selectedPatientId) {
      const fetchPatient = async () => {
        const { data, error } = await supabase
          .from('patients')
          .select('first_name, last_name, dob, gender, ssn_encrypted, insurance_id')
          .eq('id', selectedPatientId)
          .single();
        
        if (data && !error) {
          setValue('patient.name', `${data.first_name} ${data.last_name}`);
          setValue('patient.dob', data.dob);
          setValue('patient.gender', data.gender === 'female' ? 'Female' : 'Male');
          if (data.ssn_encrypted) setValue('ssn', data.ssn_encrypted);
          if (data.insurance_id) setValue('medicareId', data.insurance_id);
        }
      };
      fetchPatient();
    } else {
      // Reset auto-filled fields if no patient is selected
      setValue('patient.name', '');
      setValue('patient.dob', '');
      setValue('patient.gender', undefined);
      setValue('ssn', '');
      setValue('medicareId', '');
    }
  }, [selectedPatientId, setValue]);

  // Load existing submission when opened via View/Edit from Dashboard
  useEffect(() => {
    if (editId) {
      (async () => {
        try {
          const { data, error } = await supabase
            .from('form_responses')
            .select('*')
            .eq('id', editId)
            .maybeSingle();
          if (data && !error) {
            if (data.patient_id) setSelectedPatientId(data.patient_id);
            reset(data.data);
          }
        } catch (err) {
          console.error('MDS Assessment: Error fetching submission for edit:', err);
        }
      })();
    }
  }, [editId, reset]);

  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const submitForm = async (data: MDSFormValues, status: 'draft' | 'submitted') => {
    if (!profile) {
      setNotification({ type: 'error', message: 'You must be logged in to submit forms.' });
      return;
    }

    console.log(`MDS Form: Starting submission (status: ${status})...`);
    try {
      if (status === 'draft') setIsSavingDraft(true);
      
      if (!selectedPatientId) {
        setNotification({ type: 'error', message: 'Please select a patient from the dropdown before submitting.' });
        return;
      }

      // 1. Get Form ID if not already fetched
      let currentFormId = formId;
      if (!currentFormId) {
        console.log(`MDS Form: Form ID missing, fetching for "${FORM_NAME}"...`);
        currentFormId = (await withTimeout(getFormIdByName(FORM_NAME))) as any;
        if (!currentFormId) {
          throw new Error(`The "${FORM_NAME}" form is missing from the database. Please go to the Dashboard to run the Database Setup.`);
        }
        setFormId(currentFormId);
      }
      
      console.log(`MDS Form: Using Form ID: ${currentFormId}, Patient ID: ${selectedPatientId}`);

      // 1.5 Verify patient exists
      const { data: patientExists, error: patientCheckError } = (await withTimeout(supabase
        .from('patients')
        .select('id')
        .eq('id', selectedPatientId)
        .maybeSingle(), 60000)) as any;
      
      if (patientCheckError) {
        console.error('MDS Form: Patient check error:', patientCheckError);
      }
      
      if (!patientExists) {
        throw new Error(`The patient (ID: ${selectedPatientId}) does not exist in the database. Please select a valid patient from the dropdown.`);
      }

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
            patient_id: selectedPatientId,
            staff_id: profile.id,
            data: data,
            status: status
          }]);
        responseError = inErr;
      }
      
      if (responseError) {
        console.error('MDS Form: Response error:', responseError);
        throw responseError;
      }
      
      setNotification({ 
        type: 'success', 
        message: status === 'draft' ? 'Draft saved successfully!' : editId ? 'MDS Assessment updated successfully!' : 'MDS Assessment submitted successfully!'
      });
      if (status === 'submitted' && !editId) reset();
    } catch (error: any) {
      console.error('MDS Form: Caught error during submission:', error);
      setNotification({ type: 'error', message: `Error: ${error.message}` });
    } finally {
      setIsSavingDraft(false);
      console.log('MDS Form: Submission process finished.');
    }
  };

  const onSubmit = async (data: MDSFormValues) => await submitForm(data, 'submitted');
  const onValidationError = (errors: any) => {
    console.log('MDS Form: Validation errors:', errors);
    setNotification({ 
      type: 'error', 
      message: 'Please fill in all required fields marked with an asterisk (*).' 
    });
  };
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  const handlePrint = async () => {
    try {
      setIsGeneratingPDF(true);
      const formData = getValues();
      const success = await generateFormPDF(FORM_NAME, formData);
      
      if (!success && formRef.current) {
        // Fallback to old method if no template exists
        const { exportToPDF } = await import('../utils/pdfGenerator');
        await exportToPDF(formRef.current, `MDS_Assessment_${new Date().toISOString().split('T')[0]}.pdf`);
      }
    } catch (error) {
      console.error('PDF error:', error);
      setNotification({ type: 'error', message: 'Failed to generate PDF. Please try again.' });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-8">
      <Link to="/clinical-forms" className="flex items-center gap-2 text-zinc-500 hover:text-partners-blue-dark transition-colors mb-6 group no-print">
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-sm font-medium">Back to Forms</span>
      </Link>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-partners-blue-dark flex items-center gap-2">
            <ClipboardCheck className="text-partners-green" />
            Minimum Data Set (MDS) Assessment
          </h2>
          <p className="text-partners-gray">Comprehensive clinical assessment for care planning.</p>
        </div>
        <div className="flex gap-3 no-print">
          <Button 
            variant="secondary" 
            type="button" 
            onClick={handlePrint}
            disabled={isGeneratingPDF}
          >
            {isGeneratingPDF ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            {isGeneratingPDF ? 'Generating...' : 'Download PDF'}
          </Button>
          <Button 
            type="button"
            onClick={handleSubmit(onSubmit, onValidationError)}
            disabled={isSubmitting}
          >
            <Send className="w-4 h-4 mr-2" />
            {isSubmitting ? 'Submitting...' : 'Submit Form'}
          </Button>
        </div>
      </div>

      <form 
        ref={formRef}
        onSubmit={handleSubmit(onSubmit, onValidationError)}
        className="space-y-8 bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm"
      >
        <div className="flex flex-col md:flex-row justify-between items-start gap-6">
          <div className="w-full md:w-1/2 space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-partners-blue-dark uppercase flex items-center gap-2">
                <Users size={14} /> Select Patient <span className="text-red-500">*</span>
              </label>
              <select 
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none bg-white text-sm"
                required
              >
                <option value="">-- Select a Patient --</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.last_name}, {p.first_name}
                  </option>
                ))}
              </select>
              {isLoadingPatients && <p className="text-[10px] text-zinc-400 italic">Loading patients...</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-500 uppercase">Case Record No. <span className="text-red-500">*</span></label>
                <input {...register('caseRecordNo')} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-500 uppercase">Assessment Date <span className="text-red-500">*</span></label>
                <input type="date" {...register('assessmentDate')} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none text-sm" />
              </div>
            </div>
          </div>
          <div className="text-right space-y-1">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">MDS-HC Version 2.0</p>
            <p className="text-[10px] text-zinc-400">July 21, 1999</p>
          </div>
        </div>

        {/* SECTION AA & BB: Identification & Personal Items */}
        <section className="space-y-6 p-6 bg-zinc-50/50 rounded-2xl border border-zinc-100">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b border-zinc-200 pb-2">
            <User size={18} className="text-partners-green" />
            <h3 className="uppercase tracking-tight text-sm">Sections AA & BB. Identification & Personal Items</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-700 uppercase">Patient Name (Last, First, MI) <span className="text-red-500">*</span> {selectedPatientId && <span className="text-[10px] text-partners-green font-normal normal-case">(Auto-filled)</span>}</label>
              <input {...register('patient.name')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none bg-white" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-700 uppercase">SSN / Pension Number <span className="text-red-500">*</span> {selectedPatientId && <span className="text-[10px] text-partners-green font-normal normal-case">(Auto-filled)</span>}</label>
              <input {...register('ssn')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none bg-white" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-700 uppercase">Medicare / Health Insurance No. <span className="text-red-500">*</span> {selectedPatientId && <span className="text-[10px] text-partners-green font-normal normal-case">(Auto-filled)</span>}</label>
              <input {...register('medicareId')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none bg-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-700 uppercase">Gender <span className="text-red-500">*</span> {selectedPatientId && <span className="text-[10px] text-partners-green font-normal normal-case">(Auto-filled)</span>}</label>
              <select {...register('patient.gender')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none bg-white">
                <option value="">Select...</option>
                <option value="Male">1. Male</option>
                <option value="Female">2. Female</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-700 uppercase">Birthdate <span className="text-red-500">*</span> {selectedPatientId && <span className="text-[10px] text-partners-green font-normal normal-case">(Auto-filled)</span>}</label>
              <input type="date" {...register('patient.dob')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none bg-white" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-700 uppercase">Marital Status</label>
              <select {...register('patient.maritalStatus')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none bg-white text-sm">
                <option value="">Select...</option>
                <option value="1">1. Never married</option>
                <option value="2">2. Married</option>
                <option value="3">3. Widowed</option>
                <option value="4">4. Separated</option>
                <option value="5">5. Divorced</option>
                <option value="6">6. Other</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-700 uppercase">Primary Language</label>
              <select {...register('patient.primaryLanguage')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none bg-white text-sm">
                <option value="">Select...</option>
                <option value="0">0. English</option>
                <option value="1">1. Spanish</option>
                <option value="2">2. French</option>
                <option value="3">3. Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="text-xs font-bold text-zinc-700 uppercase">Race / Ethnicity (Check all that apply)</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'American Indian/Alaskan Native', label: 'Am. Indian/Alaskan' },
                  { id: 'Asian', label: 'Asian' },
                  { id: 'Black or African American', label: 'Black/African Am.' },
                  { id: 'Native Hawaiian or Pacific Islander', label: 'Native Hawaiian/PI' },
                  { id: 'White', label: 'White' },
                ].map(r => (
                  <label key={r.id} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-white transition-colors border border-transparent hover:border-zinc-200">
                    <input type="checkbox" value={r.id} {...register('patient.race')} className="w-4 h-4 rounded border-zinc-300 text-partners-blue-dark" />
                    <span className="text-xs text-zinc-600">{r.label}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-white transition-colors border border-transparent hover:border-zinc-200 bg-red-50/30">
                  <input type="checkbox" {...register('patient.ethnicityHispanic')} className="w-4 h-4 rounded border-zinc-300 text-red-600" />
                  <span className="text-xs font-bold text-red-700">Hispanic or Latino</span>
                </label>
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-xs font-bold text-zinc-700 uppercase">Education (Highest Level Completed)</label>
              <select {...register('patient.education')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none bg-white text-sm">
                <option value="">Select...</option>
                <option value="1">1. No schooling</option>
                <option value="2">2. 8th grade/less</option>
                <option value="3">3. 9-11 grades</option>
                <option value="4">4. High school</option>
                <option value="5">5. Technical or trade school</option>
                <option value="6">6. Some college</option>
                <option value="7">7. Bachelor's degree</option>
                <option value="8">8. Graduate degree</option>
              </select>
              <div className="pt-2 space-y-2">
                <label className="text-xs font-bold text-zinc-700 uppercase">Responsibility / Advanced Directives</label>
                <div className="space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" {...register('responsibility.legalGuardian')} className="w-4 h-4 rounded border-zinc-300" />
                    <span className="text-xs">a. Client has a legal guardian</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" {...register('responsibility.advancedDirectives')} className="w-4 h-4 rounded border-zinc-300" />
                    <span className="text-xs">b. Client has advanced medical directives</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
          
          <div className="space-y-1">
            <label className="text-xs font-bold text-zinc-700 uppercase">Reason for Assessment <span className="text-red-500">*</span></label>
            <select {...register('assessmentReason')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none bg-white text-sm">
              <option value="">Select...</option>
              <option value="1">1. Initial assessment</option>
              <option value="2">2. Follow-up assessment</option>
              <option value="3">3. Routine assessment at fixed intervals</option>
              <option value="4">4. Review within 30-day period prior to discharge</option>
              <option value="5">5. Review at return from hospital</option>
              <option value="6">6. Change in status</option>
              <option value="7">7. Other</option>
            </select>
          </div>
        </section>

        {/* SECTION CC: Referral Items */}
        <section className="space-y-6 p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b border-zinc-200 pb-2">
            <Home size={18} className="text-partners-green" />
            <h3 className="uppercase tracking-tight text-sm">Section CC. Referral Items (Intake Only)</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-700 uppercase">Date Case Opened/Reopened <span className="text-red-500">*</span></label>
              <input type="date" {...register('referral.dateOpened')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-700 uppercase">Reason for Referral</label>
              <select {...register('referral.referralReason')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none text-sm">
                <option value="">Select...</option>
                <option value="1">1. Post hospital care</option>
                <option value="2">2. Community chronic care</option>
                <option value="3">3. Home placement screen</option>
                <option value="4">4. Eligibility for home care</option>
                <option value="5">5. Day care</option>
                <option value="6">6. Other</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-700 uppercase">Time Since Last Hospital Stay</label>
              <select {...register('referral.timeSinceHospital')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none text-sm">
                <option value="">Select...</option>
                <option value="0">0. No hospitalization within 180 days</option>
                <option value="1">1. Within last week</option>
                <option value="2">2. Within 8 to 14 days</option>
                <option value="3">3. Within 15 to 30 days</option>
                <option value="4">4. More than 30 days ago</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="text-xs font-bold text-zinc-700 uppercase">Goals of Care (Client/Family Understanding)</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'skilledNursing', label: 'a. Skilled nursing treatments' },
                  { id: 'monitoring', label: 'b. Monitoring to avoid complications' },
                  { id: 'rehabilitation', label: 'c. Rehabilitation' },
                  { id: 'education', label: 'd. Client/family education' },
                  { id: 'respite', label: 'e. Family respite' },
                  { id: 'palliative', label: 'f. Palliative care' },
                ].map(g => (
                  <label key={g.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" {...register(`referral.goalsOfCare.${g.id}` as any)} className="w-4 h-4 rounded border-zinc-300" />
                    <span className="text-[11px] text-zinc-600">{g.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 uppercase">Where Lived at Referral</label>
                <select {...register('referral.whereLivedAtReferral')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none text-[11px]">
                  <option value="">Select...</option>
                  <option value="1">1. Private home/apt (no services)</option>
                  <option value="2">2. Private home/apt (with services)</option>
                  <option value="3">3. Board and care/assisted living</option>
                  <option value="4">4. Nursing home</option>
                  <option value="5">5. Other</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 uppercase">Who Lived With at Referral</label>
                <select {...register('referral.whoLivedWithAtReferral')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none text-[11px]">
                  <option value="">Select...</option>
                  <option value="1">1. Lived alone</option>
                  <option value="2">2. Lived with spouse only</option>
                  <option value="3">3. Lived with spouse and other(s)</option>
                  <option value="4">4. Lived with child (not spouse)</option>
                  <option value="5">5. Lived with other(s)</option>
                  <option value="6">6. Lived in group setting</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex gap-8 border-t border-zinc-100 pt-4">
            <div className="flex items-center gap-4">
              <span className="text-xs font-bold text-zinc-700 uppercase">Prior NH Placement (5 years)?</span>
              <div className="flex gap-4">
                {[
                  { value: false, label: '0. No' },
                  { value: true, label: '1. Yes' },
                ].map(v => (
                  <label key={v.label} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value={v.value ? 'true' : 'false'} {...register('referral.priorNHPlacement')} className="w-4 h-4 text-partners-blue-dark" />
                    <span className="text-xs">{v.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs font-bold text-zinc-700 uppercase">Moved in last 2 years?</span>
              <div className="flex gap-4">
                {[
                  { value: false, label: '0. No' },
                  { value: true, label: '1. Yes' },
                ].map(v => (
                  <label key={v.label} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value={v.value ? 'true' : 'false'} {...register('referral.residentialHistory')} className="w-4 h-4 text-partners-blue-dark" />
                    <span className="text-xs">{v.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION B: Cognitive Patterns */}
        <section className="space-y-6 p-6 bg-zinc-50/50 rounded-2xl border border-zinc-100">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b border-zinc-200 pb-2">
            <Brain size={18} className="text-partners-green" />
            <h3 className="uppercase tracking-tight text-sm">Section B. Cognitive Patterns</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <label className="text-xs font-bold text-zinc-700 uppercase">1. Memory Recall Ability (Recall after 5 mins)</label>
              <div className="space-y-3 bg-white p-4 rounded-xl border border-zinc-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs">a. Short-term memory OK</span>
                  <select {...register('cognitive.memory.shortTerm')} className="px-3 py-1 rounded border border-zinc-200 text-xs outline-none focus:ring-1 focus:ring-partners-blue-dark">
                    <option value="">Select...</option>
                    <option value="Memory OK">0. Memory OK</option>
                    <option value="Memory problem">1. Memory problem</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs">b. Procedural memory OK</span>
                  <select {...register('cognitive.memory.procedural')} className="px-3 py-1 rounded border border-zinc-200 text-xs outline-none focus:ring-1 focus:ring-partners-blue-dark">
                    <option value="">Select...</option>
                    <option value="Memory OK">0. Memory OK</option>
                    <option value="Memory problem">1. Memory problem</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-xs font-bold text-zinc-700 uppercase">2. Cognitive Skills for Daily Decision Making <span className="text-red-500">*</span></label>
              <div className="space-y-2">
                {[
                  { value: 'Independent', label: '0. INDEPENDENT—Decisions consistent/reasonable/safe' },
                  { value: 'Modified Independent', label: '1. MODIFIED INDEPENDENCE—Some difficulty in new situations' },
                  { value: 'Minimally Impaired', label: '2. MINIMALLY IMPAIRED—Supervision necessary at times' },
                  { value: 'Moderately Impaired', label: '3. MODERATELY IMPAIRED—Cues/supervision required at all times' },
                  { value: 'Severely Impaired', label: '4. SEVERELY IMPAIRED—Never/rarely made decisions' },
                ].map(v => (
                  <label key={v.value} className="flex items-center gap-2 cursor-pointer p-1.5 hover:bg-white rounded transition-colors">
                    <input type="radio" value={v.value} {...register('cognitive.decisionMaking')} className="w-4 h-4 text-partners-blue-dark" />
                    <span className="text-[11px] text-zinc-600">{v.label}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 cursor-pointer pt-2 mt-2 border-t border-zinc-200">
                  <input type="checkbox" {...register('cognitive.decisionMakingDecline')} className="w-4 h-4 rounded border-zinc-300" />
                  <span className="text-[11px] font-bold text-red-600 uppercase">Worsening of decision making (last 90 days)</span>
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-zinc-200">
            <label className="text-xs font-bold text-zinc-700 uppercase">3. Indicators of Delirium</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-3 p-3 bg-white rounded-xl border border-zinc-200 cursor-pointer hover:shadow-sm transition-shadow">
                <input type="checkbox" {...register('cognitive.delirium.suddenOnset')} className="w-5 h-5 rounded border-zinc-300 text-partners-blue-dark" />
                <div className="space-y-0.5">
                  <p className="text-xs font-bold">a. Sudden or new onset/change in mental function</p>
                  <p className="text-[10px] text-zinc-500">LAST 7 DAYS (attention, awareness, variation over day)</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 bg-white rounded-xl border border-zinc-200 cursor-pointer hover:shadow-sm transition-shadow">
                <input type="checkbox" {...register('cognitive.delirium.agitatedDisoriented')} className="w-5 h-5 rounded border-zinc-300 text-partners-blue-dark" />
                <div className="space-y-0.5">
                  <p className="text-xs font-bold">b. Agitated or disoriented (safety endangered)</p>
                  <p className="text-[10px] text-zinc-500">LAST 90 DAYS (requires protection by others)</p>
                </div>
              </label>
            </div>
          </div>
        </section>

        {/* SECTION C & D: Communication & Vision */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6 p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm">
            <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b border-zinc-200 pb-2">
              <Activity size={18} className="text-partners-green" />
              <h3 className="uppercase tracking-tight text-sm">Section C. Communication Patterns</h3>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 uppercase">1. Hearing (with appliance if used) <span className="text-red-500">*</span></label>
                <select {...register('communication.hearing')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 text-xs outline-none focus:ring-2 focus:ring-partners-blue-dark">
                  <option value="">Select...</option>
                  <option value="0">0. HEARS ADEQUATELY</option>
                  <option value="1">1. MINIMAL DIFFICULTY</option>
                  <option value="2">2. HEARS IN SPECIAL SITUATIONS ONLY</option>
                  <option value="3">3. HIGHLY IMPAIRED</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 uppercase">2. Making Self Understood (Expression)</label>
                <select {...register('communication.makingSelfUnderstood')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 text-xs outline-none focus:ring-2 focus:ring-partners-blue-dark">
                  <option value="">Select...</option>
                  <option value="0">0. UNDERSTOOD</option>
                  <option value="1">1. USUALLY UNDERSTOOD</option>
                  <option value="2">2. OFTEN UNDERSTOOD</option>
                  <option value="3">3. SOMETIMES UNDERSTOOD</option>
                  <option value="4">4. RARELY/NEVER UNDERSTOOD</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 uppercase">3. Ability to Understand Others (Comprehension)</label>
                <select {...register('communication.abilityToUnderstandOthers')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 text-xs outline-none focus:ring-2 focus:ring-partners-blue-dark">
                  <option value="">Select...</option>
                  <option value="0">0. UNDERSTANDS</option>
                  <option value="1">1. USUALLY UNDERSTANDS</option>
                  <option value="2">2. OFTEN UNDERSTANDS</option>
                  <option value="3">3. SOMETIMES UNDERSTANDS</option>
                  <option value="4">4. RARELY/NEVER UNDERSTANDS</option>
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer pt-2 border-t border-zinc-100">
                <input type="checkbox" {...register('communication.communicationDecline')} className="w-4 h-4 rounded border-zinc-300" />
                <span className="text-[11px] font-bold text-red-600 uppercase">Worsening in communication (last 90 days)</span>
              </label>
            </div>
          </div>

          <div className="space-y-6 p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm">
            <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b border-zinc-200 pb-2">
              <Activity size={18} className="text-partners-green" />
              <h3 className="uppercase tracking-tight text-sm">Section D. Vision Patterns</h3>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 uppercase">1. Vision (with glasses if used) <span className="text-red-500">*</span></label>
                <select {...register('vision.vision')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 text-xs outline-none focus:ring-2 focus:ring-partners-blue-dark">
                  <option value="">Select...</option>
                  <option value="0">0. ADEQUATE</option>
                  <option value="1">1. IMPAIRED</option>
                  <option value="2">2. MODERATELY IMPAIRED</option>
                  <option value="3">3. HIGHLY IMPAIRED</option>
                  <option value="4">4. SEVERELY IMPAIRED</option>
                </select>
              </div>
              <div className="space-y-4 pt-2">
                <label className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl border border-zinc-100 cursor-pointer">
                  <input type="checkbox" {...register('vision.visualLimitations')} className="w-5 h-5 rounded border-zinc-300 text-partners-blue-dark" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold uppercase">Visual Limitation / Difficulties</p>
                    <p className="text-[10px] text-zinc-500">Saw halos, rings, curtains over eyes, or flashes</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl border border-zinc-100 cursor-pointer">
                  <input type="checkbox" {...register('vision.visionDecline')} className="w-5 h-5 rounded border-zinc-300 text-red-600" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold uppercase text-red-700">Vision Decline</p>
                    <p className="text-[10px] text-red-500">Worsening as compared to 90 days ago</p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION E: Mood and Behavior Patterns */}
        <section className="space-y-6 p-6 bg-zinc-50/50 rounded-2xl border border-zinc-100">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b border-zinc-200 pb-2">
            <Activity size={18} className="text-partners-green" />
            <h3 className="uppercase tracking-tight text-sm">Section E. Mood and Behavior Patterns</h3>
          </div>
          
          <div className="space-y-4">
            <label className="text-xs font-bold text-zinc-700 uppercase">1. Indicators of Depression, Anxiety, Sad Mood (Last 3 Days) <span className="text-red-500">*</span></label>
            <p className="text-[10px] text-zinc-500 italic">0: Not exhibited | 1: Exhibited 1-2 days | 2: Exhibited on each of last 3 days</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 bg-white p-6 rounded-2xl border border-zinc-200">
              {[
                { id: 'sadness', label: 'a. Feeling of sadness or being depressed' },
                { id: 'anger', label: 'b. Persistent anger with self or others' },
                { id: 'unrealisticFears', label: 'c. Expressions of unrealistic fears' },
                { id: 'repetitiveHealthComplaints', label: 'd. Repetitive health complaints' },
                { id: 'repetitiveAnxiousComplaints', label: 'e. Repetitive anxious complaints/concerns' },
                { id: 'facialExpressions', label: 'f. Sad, pained, worried facial expressions' },
                { id: 'crying', label: 'g. Recurrent crying, tearfulness' },
                { id: 'withdrawal', label: 'h. Withdrawal from activities of interest' },
                { id: 'reducedSocialInteraction', label: 'i. Reduced social interaction' },
              ].map(item => (
                <div key={item.id} className="flex items-center justify-between gap-4 border-b border-zinc-50 pb-2">
                  <span className="text-[11px] text-zinc-600">{item.label}</span>
                  <select {...register(`mood.indicators.${item.id}` as any, { valueAsNumber: true })} className="px-2 py-1 rounded border border-zinc-200 text-[10px] outline-none focus:ring-1 focus:ring-partners-blue-dark bg-zinc-50">
                    <option value="0">0</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                  </select>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 cursor-pointer pt-2">
              <input type="checkbox" {...register('mood.moodDecline')} className="w-4 h-4 rounded border-zinc-300" />
              <span className="text-[11px] font-bold text-red-600 uppercase">Mood indicators have become worse (last 90 days)</span>
            </label>
          </div>

          <div className="space-y-4 pt-4 border-t border-zinc-200">
            <label className="text-xs font-bold text-zinc-700 uppercase">3. Behavioral Symptoms (Last 3 Days)</label>
            <p className="text-[10px] text-zinc-500 italic">0: Did not occur | 1: Occurred, easily altered | 2: Occurred, not easily altered</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 bg-white p-6 rounded-2xl border border-zinc-200">
              {[
                { id: 'wandering', label: 'a. Wandering (no rational purpose)' },
                { id: 'verballyAbusive', label: 'b. Verbally abusive behavioral symptoms' },
                { id: 'physicallyAbusive', label: 'c. Physically abusive behavioral symptoms' },
                { id: 'sociallyInappropriate', label: 'd. Socially inappropriate/disruptive symptoms' },
                { id: 'resistsCare', label: 'e. Resists care' },
              ].map(item => (
                <div key={item.id} className="flex items-center justify-between gap-4 border-b border-zinc-50 pb-2">
                  <span className="text-[11px] text-zinc-600">{item.label}</span>
                  <select {...register(`mood.behavioralSymptoms.${item.id}` as any, { valueAsNumber: true })} className="px-2 py-1 rounded border border-zinc-200 text-[10px] outline-none focus:ring-1 focus:ring-partners-blue-dark bg-zinc-50">
                    <option value="0">0</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                  </select>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 cursor-pointer pt-2">
              <input type="checkbox" {...register('mood.behavioralSymptomsDecline')} className="w-4 h-4 rounded border-zinc-300" />
              <span className="text-[11px] font-bold text-red-600 uppercase">Behavioral symptoms have become worse (last 90 days)</span>
            </label>
          </div>
        </section>

        {/* SECTION F: Social Functioning */}
        <section className="space-y-6 p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b border-zinc-200 pb-2">
            <Users size={18} className="text-partners-green" />
            <h3 className="uppercase tracking-tight text-sm">Section F. Social Functioning</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <label className="text-xs font-bold text-zinc-700 uppercase">1. Involvement</label>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl">
                  <span className="text-xs">a. At ease interacting with others</span>
                  <select {...register('social.involvement.atEase')} className="px-3 py-1 rounded border border-zinc-200 text-xs outline-none focus:ring-1 focus:ring-partners-blue-dark">
                    <option value="">Select...</option>
                    <option value="At ease">0. At ease</option>
                    <option value="Not at ease">1. Not at ease</option>
                  </select>
                </div>
                <label className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl border border-zinc-100 cursor-pointer">
                  <input type="checkbox" {...register('social.involvement.expressesConflict')} className="w-5 h-5 rounded border-zinc-300 text-partners-blue-dark" />
                  <span className="text-xs">b. Expresses conflict or anger with family/friends</span>
                </label>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-xs font-bold text-zinc-700 uppercase">2. Change in Social Activities</label>
              <select {...register('social.socialActivitiesChange')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 text-xs outline-none focus:ring-2 focus:ring-partners-blue-dark">
                <option value="">Select...</option>
                <option value="0">0. NO CHANGE</option>
                <option value="1">1. DECLINE in activities (last 90 days)</option>
                <option value="2">2. Client PREFERS more activities</option>
              </select>
              
              <div className="space-y-3 pt-2">
                <label className="text-xs font-bold text-zinc-700 uppercase">3. Isolation</label>
                <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl">
                  <span className="text-xs">a. Length of time alone</span>
                  <select {...register('social.isolation.timeAlone')} className="px-3 py-1 rounded border border-zinc-200 text-xs outline-none focus:ring-1 focus:ring-partners-blue-dark">
                    <option value="">Select...</option>
                    <option value="1">1. Alone long periods</option>
                    <option value="2">2. Alone some periods</option>
                    <option value="3">3. Rarely alone</option>
                  </select>
                </div>
                <label className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl border border-zinc-100 cursor-pointer">
                  <input type="checkbox" {...register('social.isolation.feelsLonely')} className="w-5 h-5 rounded border-zinc-300 text-partners-blue-dark" />
                  <span className="text-xs">b. Says he/she feels lonely</span>
                </label>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION G: Informal Support Services */}
        <section className="space-y-6 p-6 bg-zinc-50/50 rounded-2xl border border-zinc-100">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b border-zinc-200 pb-2">
            <Users size={18} className="text-partners-green" />
            <h3 className="uppercase tracking-tight text-sm">Section G. Informal Support Services</h3>
          </div>
          
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Primary Helper */}
              <div className="space-y-4 p-4 bg-white rounded-2xl border border-zinc-200">
                <h4 className="text-[10px] font-black text-partners-blue-dark uppercase tracking-widest">Primary Helper</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Name</label>
                    <input {...register('informalSupport.helpers.primary.name')} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Relationship</label>
                    <select {...register('informalSupport.helpers.primary.relationship')} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-xs">
                      <option value="">Select...</option>
                      <option value="1">1. Spouse</option>
                      <option value="2">2. Child</option>
                      <option value="3">3. Other relative</option>
                      <option value="4">4. Friend/Neighbor</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 pt-4">
                    <input type="checkbox" {...register('informalSupport.helpers.primary.livesWith')} className="w-4 h-4 rounded" />
                    <span className="text-[10px] font-bold uppercase">Lives with client</span>
                  </div>
                </div>
                <div className="space-y-2 pt-2 border-t border-zinc-50">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase">Areas of Help Provided</p>
                  <div className="flex gap-4">
                    {['advice', 'iadl', 'adl'].map(area => (
                      <label key={area} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" {...register(`informalSupport.helpers.primary.${area}` as any)} className="w-3.5 h-3.5 rounded" />
                        <span className="text-[10px] uppercase">{area}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-1 pt-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase">Willingness to increase help</label>
                  <select {...register('informalSupport.helpers.primary.willingnessToIncrease')} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-[10px]">
                    <option value="">Select...</option>
                    <option value="0">0. Yes</option>
                    <option value="1">1. No</option>
                    <option value="2">2. Unknown</option>
                  </select>
                </div>
              </div>

              {/* Secondary Helper */}
              <div className="space-y-4 p-4 bg-white rounded-2xl border border-zinc-200">
                <h4 className="text-[10px] font-black text-partners-blue-dark uppercase tracking-widest">Secondary Helper</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Name</label>
                    <input {...register('informalSupport.helpers.secondary.name')} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Relationship</label>
                    <select {...register('informalSupport.helpers.secondary.relationship')} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-xs">
                      <option value="">Select...</option>
                      <option value="1">1. Spouse</option>
                      <option value="2">2. Child</option>
                      <option value="3">3. Other relative</option>
                      <option value="4">4. Friend/Neighbor</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 pt-4">
                    <input type="checkbox" {...register('informalSupport.helpers.secondary.livesWith')} className="w-4 h-4 rounded" />
                    <span className="text-[10px] font-bold uppercase">Lives with client</span>
                  </div>
                </div>
                <div className="space-y-2 pt-2 border-t border-zinc-50">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase">Areas of Help Provided</p>
                  <div className="flex gap-4">
                    {['advice', 'iadl', 'adl'].map(area => (
                      <label key={area} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" {...register(`informalSupport.helpers.secondary.${area}` as any)} className="w-3.5 h-3.5 rounded" />
                        <span className="text-[10px] uppercase">{area}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-1 pt-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase">Willingness to increase help</label>
                  <select {...register('informalSupport.helpers.secondary.willingnessToIncrease')} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-[10px]">
                    <option value="">Select...</option>
                    <option value="0">0. Yes</option>
                    <option value="1">1. No</option>
                    <option value="2">2. Unknown</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-zinc-200">
              <div className="space-y-3">
                <label className="text-xs font-bold text-zinc-700 uppercase">2. Caregiver Status (Last 3 Days)</label>
                <div className="space-y-2 bg-white p-4 rounded-xl border border-zinc-200">
                  {[
                    { id: 'unableToContinue', label: 'a. Unable to continue care activities' },
                    { id: 'notSatisfied', label: 'b. Not satisfied with support from family/friends' },
                    { id: 'expressesDistress', label: 'c. Expresses feelings of distress/anger/depression' },
                    { id: 'noneOfAbove', label: 'd. NONE OF ABOVE' },
                  ].map(item => (
                    <label key={item.id} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" {...register(`informalSupport.caregiverStatus.${item.id}` as any)} className="w-4 h-4 rounded" />
                      <span className="text-[11px] text-zinc-600">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-xs font-bold text-zinc-700 uppercase">3. Extent of Informal Help</label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Weekday Hours</label>
                    <input type="number" {...register('informalSupport.informalHelpExtent.weekdayHours')} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-sm" placeholder="Hours" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Weekend Hours</label>
                    <input type="number" {...register('informalSupport.informalHelpExtent.weekendHours')} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-sm" placeholder="Hours" />
                  </div>
                </div>
                <p className="text-[10px] text-zinc-400 italic pt-2">Total hours of help provided by all informal helpers in last 7 days.</p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION H: Physical Functioning */}
        <section className="space-y-6 p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b border-zinc-200 pb-2">
            <Activity size={18} className="text-partners-green" />
            <h3 className="uppercase tracking-tight text-sm">Section H. Physical Functioning</h3>
          </div>
          
          <div className="space-y-6">
            <div className="space-y-4">
              <label className="text-xs font-bold text-zinc-700 uppercase">1. IADL Self-Performance & Difficulty (Last 3 Days) <span className="text-red-500">*</span></label>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 text-[10px] font-bold uppercase text-zinc-500">
                      <th className="p-2 border border-zinc-100">Task</th>
                      <th className="p-2 border border-zinc-100">Performance</th>
                      <th className="p-2 border border-zinc-100">Difficulty</th>
                    </tr>
                  </thead>
                  <tbody className="text-[11px]">
                    {[
                      { id: 'mealPrep', label: 'a. Meal preparation' },
                      { id: 'housework', label: 'b. Ordinary housework' },
                      { id: 'finance', label: 'c. Managing finances' },
                      { id: 'meds', label: 'd. Managing medications' },
                      { id: 'phone', label: 'e. Phone use' },
                      { id: 'shopping', label: 'f. Shopping' },
                      { id: 'transport', label: 'g. Transportation' },
                    ].map(task => (
                      <tr key={task.id}>
                        <td className="p-2 border border-zinc-100 font-medium">{task.label}</td>
                        <td className="p-2 border border-zinc-100">
                          <select {...register(`physical.iadl.${task.id}.performance` as any)} className="w-full bg-transparent outline-none">
                            <option value="0">0. Independent</option>
                            <option value="1">1. Done with help</option>
                            <option value="2">2. Done by others</option>
                            <option value="3">3. Not done</option>
                          </select>
                        </td>
                        <td className="p-2 border border-zinc-100">
                          <select {...register(`physical.iadl.${task.id}.difficulty` as any)} className="w-full bg-transparent outline-none">
                            <option value="0">0. No difficulty</option>
                            <option value="1">1. Some difficulty</option>
                            <option value="2">2. Great difficulty</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-zinc-100">
              <div className="space-y-4">
                <label className="text-xs font-bold text-zinc-700 uppercase">2. ADL Self-Performance (Last 3 Days) <span className="text-red-500">*</span></label>
                <div className="space-y-2 bg-zinc-50 p-4 rounded-xl">
                  {[
                    { id: 'mobilityInBed', label: 'a. Mobility in bed' },
                    { id: 'transfer', label: 'b. Transfer' },
                    { id: 'locomotionInHome', label: 'c. Locomotion in home' },
                    { id: 'locomotionOutsideHome', label: 'd. Locomotion outside home' },
                    { id: 'dressingUpperBody', label: 'e. Dressing upper body' },
                    { id: 'dressingLowerBody', label: 'f. Dressing lower body' },
                    { id: 'eating', label: 'g. Eating' },
                    { id: 'toiletUse', label: 'h. Toilet use' },
                    { id: 'personalHygiene', label: 'i. Personal hygiene' },
                    { id: 'bathing', label: 'j. Bathing' },
                  ].map(adl => (
                    <div key={adl.id} className="flex items-center justify-between gap-4 border-b border-zinc-100 pb-1">
                      <span className="text-[11px]">{adl.label}</span>
                      <select {...register(`physical.adl.${adl.id}` as any)} className="px-2 py-0.5 rounded border border-zinc-200 text-[10px] outline-none focus:ring-1 focus:ring-partners-blue-dark">
                        <option value="0">0. Independent</option>
                        <option value="1">1. Supervision</option>
                        <option value="2">2. Limited assistance</option>
                        <option value="3">3. Extensive assistance</option>
                        <option value="4">4. Total dependence</option>
                        <option value="8">8. Did not occur</option>
                      </select>
                    </div>
                  ))}
                  <label className="flex items-center gap-2 cursor-pointer pt-2 mt-2 border-t border-zinc-200">
                    <input type="checkbox" {...register('physical.adlDecline')} className="w-4 h-4 rounded border-zinc-300" />
                    <span className="text-[11px] font-bold text-red-600 uppercase">ADL status has become worse (last 90 days)</span>
                  </label>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-xs font-bold text-zinc-700 uppercase">3. Primary Modes of Locomotion</label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase">Indoors</label>
                      <select {...register('physical.locomotionModes.indoors')} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-[10px]">
                        <option value="0">0. Walking (no help)</option>
                        <option value="1">1. Walking (with help)</option>
                        <option value="2">2. Wheelchair</option>
                        <option value="3">3. Bedfast</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase">Outdoors</label>
                      <select {...register('physical.locomotionModes.outdoors')} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-[10px]">
                        <option value="0">0. Walking (no help)</option>
                        <option value="1">1. Walking (with help)</option>
                        <option value="2">2. Wheelchair</option>
                        <option value="3">3. Bedfast</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-700 uppercase">4. Stair Climbing</label>
                    <select {...register('physical.stairClimbing')} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-[10px]">
                      <option value="0">0. Up/down (no help)</option>
                      <option value="1">1. Up/down (with help)</option>
                      <option value="2">2. Not done</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-700 uppercase">5. Days Went Out (Last 7)</label>
                    <select {...register('physical.stamina.daysWentOut')} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-[10px]">
                      <option value="0">0. None</option>
                      <option value="1">1. 1-2 days</option>
                      <option value="2">2. 3-4 days</option>
                      <option value="3">3. 5+ days</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-3 pt-2 border-t border-zinc-100">
                  <label className="text-xs font-bold text-zinc-700 uppercase">7. Functional Potential</label>
                  <div className="space-y-2 bg-zinc-50 p-4 rounded-xl">
                    {[
                      { id: 'increasedIndependence', label: 'a. Believes he/she could be more independent' },
                      { id: 'caregiverBelief', label: 'b. Caregiver believes client could be more independent' },
                      { id: 'prospectsOfRecovery', label: 'c. Good prospects of recovery' },
                      { id: 'noneOfAbove', label: 'd. NONE OF ABOVE' },
                    ].map(item => (
                      <label key={item.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" {...register(`physical.functionalPotential.${item.id}` as any)} className="w-4 h-4 rounded" />
                        <span className="text-[11px] text-zinc-600">{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION I: Continence */}
        <section className="space-y-6 p-6 bg-zinc-50/50 rounded-2xl border border-zinc-100">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b border-zinc-200 pb-2">
            <Activity size={18} className="text-partners-green" />
            <h3 className="uppercase tracking-tight text-sm">Section I. Continence in Last 7 Days</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 uppercase">1. Bladder Continence</label>
                <select {...register('continence.bladderContinence')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 text-xs outline-none focus:ring-2 focus:ring-partners-blue-dark bg-white">
                  <option value="">Select...</option>
                  <option value="0">0. CONTINENT</option>
                  <option value="1">1. USUALLY CONTINENT (incontinent &lt; weekly)</option>
                  <option value="2">2. OCCASIONALLY INCONTINENT (1+ times weekly)</option>
                  <option value="3">3. FREQUENTLY INCONTINENT (daily)</option>
                  <option value="4">4. INCONTINENT (multiple times daily)</option>
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer pt-2">
                <input type="checkbox" {...register('continence.bladderDecline')} className="w-4 h-4 rounded border-zinc-300" />
                <span className="text-[11px] font-bold text-red-600 uppercase">Bladder status has become worse (last 90 days)</span>
              </label>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 uppercase">2. Bowel Continence</label>
                <select {...register('continence.bowelContinence')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 text-xs outline-none focus:ring-2 focus:ring-partners-blue-dark bg-white">
                  <option value="">Select...</option>
                  <option value="0">0. CONTINENT</option>
                  <option value="1">1. USUALLY CONTINENT</option>
                  <option value="2">2. OCCASIONALLY INCONTINENT</option>
                  <option value="3">3. FREQUENTLY INCONTINENT</option>
                  <option value="4">4. INCONTINENT</option>
                </select>
              </div>
              <div className="space-y-2 pt-2">
                <p className="text-[10px] font-bold text-zinc-400 uppercase">3. Bladder Devices</p>
                <div className="flex gap-4">
                  {[
                    { id: 'pads', label: 'a. Pads/Briefs' },
                    { id: 'catheter', label: 'b. Catheter' },
                    { id: 'none', label: 'c. None' },
                  ].map(device => (
                    <label key={device.id} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" {...register(`continence.bladderDevices.${device.id}` as any)} className="w-3.5 h-3.5 rounded" />
                      <span className="text-[10px] uppercase">{device.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION J: Disease Diagnoses */}
        <section className="space-y-6 p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b border-zinc-200 pb-2">
            <HeartPulse size={18} className="text-partners-green" />
            <h3 className="uppercase tracking-tight text-sm">Section J. Disease Diagnoses</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-partners-blue-dark uppercase tracking-widest">Heart / Circulation</h4>
              <div className="space-y-1 bg-zinc-50 p-3 rounded-xl">
                {['Hypertension', 'CHF', 'CVA', 'CAD', 'PVD'].map(d => (
                  <label key={d} className="flex items-center gap-2 cursor-pointer py-0.5">
                    <input type="checkbox" value={d} {...register('diagnoses.heart')} className="w-3.5 h-3.5 rounded" />
                    <span className="text-[11px] text-zinc-600">{d}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-partners-blue-dark uppercase tracking-widest">Neurological</h4>
              <div className="space-y-1 bg-zinc-50 p-3 rounded-xl">
                {['Alzheimer\'s', 'Dementia', 'Parkinson\'s', 'MS', 'Hemiplegia'].map(d => (
                  <label key={d} className="flex items-center gap-2 cursor-pointer py-0.5">
                    <input type="checkbox" value={d} {...register('diagnoses.neuro')} className="w-3.5 h-3.5 rounded" />
                    <span className="text-[11px] text-zinc-600">{d}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-partners-blue-dark uppercase tracking-widest">Psychiatric</h4>
              <div className="space-y-1 bg-zinc-50 p-3 rounded-xl">
                {['Anxiety', 'Depression', 'Schizophrenia', 'Bipolar'].map(d => (
                  <label key={d} className="flex items-center gap-2 cursor-pointer py-0.5">
                    <input type="checkbox" value={d} {...register('diagnoses.psych')} className="w-3.5 h-3.5 rounded" />
                    <span className="text-[11px] text-zinc-600">{d}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-zinc-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-700 uppercase">Other Current Diagnoses (with ICD Codes)</label>
              <Button type="button" variant="secondary" size="sm" onClick={() => appendDiag({ name: '', icd: '' })} className="h-7 text-[10px] gap-1">
                <Plus size={12} /> Add Diagnosis
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {diagFields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2 bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                  <input {...register(`diagnoses.otherDiagnoses.${index}.name` as any)} placeholder="Diagnosis Name" className="flex-1 bg-white px-3 py-1.5 rounded-lg border border-zinc-200 text-xs" />
                  <input {...register(`diagnoses.otherDiagnoses.${index}.icd` as any)} placeholder="ICD" className="w-20 bg-white px-3 py-1.5 rounded-lg border border-zinc-200 text-xs" />
                  <button type="button" onClick={() => removeDiag(index)} className="text-red-500 hover:text-red-700 p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION K: Health Conditions */}
        <section className="space-y-6 p-6 bg-zinc-50/50 rounded-2xl border border-zinc-100">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b border-zinc-200 pb-2">
            <Stethoscope size={18} className="text-partners-green" />
            <h3 className="uppercase tracking-tight text-sm">Section K. Health Conditions</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <label className="text-xs font-bold text-zinc-700 uppercase">1. Health Problems (Last 7 Days)</label>
              <div className="space-y-2 bg-white p-4 rounded-xl border border-zinc-200">
                {[
                  { id: 'falls', label: 'a. Falls (last 90 days)' },
                  { id: 'unsteadyGait', label: 'b. Unsteady gait' },
                  { id: 'dizziness', label: 'c. Dizziness' },
                  { id: 'edema', label: 'd. Edema' },
                  { id: 'shortnessOfBreath', label: 'e. Shortness of breath' },
                  { id: 'chestPain', label: 'f. Chest pain' },
                  { id: 'vomiting', label: 'g. Vomiting' },
                  { id: 'dehydration', label: 'h. Dehydration' },
                ].map(item => (
                  <label key={item.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" {...register(`healthConditions.problems.${item.id}` as any)} className="w-4 h-4 rounded" />
                    <span className="text-[11px] text-zinc-600">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-xs font-bold text-zinc-700 uppercase">2. Pain (Last 3 Days)</label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Frequency</label>
                    <select {...register('healthConditions.pain.frequency')} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-[10px]">
                      <option value="0">0. No pain</option>
                      <option value="1">1. Less than daily</option>
                      <option value="2">2. Daily</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Intensity</label>
                    <select {...register('healthConditions.pain.intensity')} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-[10px]">
                      <option value="1">1. Mild</option>
                      <option value="2">2. Moderate</option>
                      <option value="3">3. Severe</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-zinc-100">
                <label className="text-xs font-bold text-zinc-700 uppercase">3. Self-Reported Health</label>
                <select {...register('healthConditions.selfReportedHealth')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 text-xs outline-none focus:ring-2 focus:ring-partners-blue-dark bg-white">
                  <option value="">Select...</option>
                  <option value="0">0. Excellent</option>
                  <option value="1">1. Good</option>
                  <option value="2">2. Fair</option>
                  <option value="3">3. Poor</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION L: Oral/Nutritional Status */}
        <section className="space-y-6 p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b border-zinc-200 pb-2">
            <Activity size={18} className="text-partners-green" />
            <h3 className="uppercase tracking-tight text-sm">Section L. Oral/Nutritional Status</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <label className="text-xs font-bold text-zinc-700 uppercase">1. Nutritional Problems</label>
              <div className="space-y-2 bg-zinc-50 p-4 rounded-xl">
                {[
                  { id: 'weightLoss', label: 'a. Weight loss (5%+ in 30 days or 10%+ in 180 days)' },
                  { id: 'dehydration', label: 'b. Dehydration' },
                  { id: 'poorAppetite', label: 'c. Poor appetite' },
                  { id: 'swallowingProblem', label: 'd. Swallowing problem' },
                ].map(item => (
                  <label key={item.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" {...register(`nutrition.problems.${item.id}` as any)} className="w-4 h-4 rounded" />
                    <span className="text-[11px] text-zinc-600">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 uppercase">2. Height & Weight</label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Height (inches)</label>
                    <input type="number" {...register('nutrition.height')} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Weight (lbs)</label>
                    <input type="number" {...register('nutrition.weight')} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-sm" />
                  </div>
                </div>
              </div>
              <div className="space-y-1 pt-2">
                <label className="text-xs font-bold text-zinc-700 uppercase">3. Drinking (Last 3 Days)</label>
                <select {...register('nutrition.drinking')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 text-xs outline-none focus:ring-2 focus:ring-partners-blue-dark">
                  <option value="0">0. 8+ cups daily</option>
                  <option value="1">1. 4-7 cups daily</option>
                  <option value="2">2. Less than 4 cups daily</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION M: Skin Condition */}
        <section className="space-y-6 p-6 bg-zinc-50/50 rounded-2xl border border-zinc-100">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b border-zinc-200 pb-2">
            <Activity size={18} className="text-partners-green" />
            <h3 className="uppercase tracking-tight text-sm">Section M. Skin Condition</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <label className="text-xs font-bold text-zinc-700 uppercase">1. Skin Problems</label>
              <div className="space-y-2 bg-white p-4 rounded-xl border border-zinc-200">
                {[
                  { id: 'pressureUlcer', label: 'a. Pressure ulcer' },
                  { id: 'stasisUlcer', label: 'b. Stasis ulcer' },
                  { id: 'skinTear', label: 'c. Skin tear' },
                  { id: 'rash', label: 'd. Rash' },
                  { id: 'other', label: 'e. Other skin problem' },
                ].map(item => (
                  <label key={item.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" {...register(`skin.problems.${item.id}` as any)} className="w-4 h-4 rounded" />
                    <span className="text-[11px] text-zinc-600">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 uppercase">2. Foot Problems</label>
                <div className="space-y-2 bg-white p-4 rounded-xl border border-zinc-200">
                  {[
                    { id: 'bunions', label: 'a. Bunions, corns, calluses' },
                    { id: 'nails', label: 'b. Overgrown/ingrown nails' },
                    { id: 'infection', label: 'c. Infection' },
                  ].map(item => (
                    <label key={item.id} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" {...register(`skin.footProblems.${item.id}` as any)} className="w-4 h-4 rounded" />
                      <span className="text-[11px] text-zinc-600">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION N: Environmental Assessment */}
        <section className="space-y-6 p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b border-zinc-200 pb-2">
            <Home size={18} className="text-partners-green" />
            <h3 className="uppercase tracking-tight text-sm">Section N. Environmental Assessment</h3>
          </div>
          
          <div className="space-y-4">
            <label className="text-xs font-bold text-zinc-700 uppercase">1. Home Environment (Last 30 Days)</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 bg-zinc-50 p-6 rounded-2xl">
              {[
                { id: 'lighting', label: 'a. Inadequate lighting' },
                { id: 'flooring', label: 'b. Flooring in disrepair' },
                { id: 'clutter', label: 'c. Clutter' },
                { id: 'bathroom', label: 'd. Inadequate bathroom' },
                { id: 'kitchen', label: 'e. Inadequate kitchen' },
                { id: 'heating', label: 'f. Inadequate heating/cooling' },
                { id: 'access', label: 'g. Limited access to home' },
                { id: 'safety', label: 'h. Unsafe neighborhood' },
              ].map(item => (
                <label key={item.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" {...register(`environment.homeProblems.${item.id}` as any)} className="w-4 h-4 rounded" />
                  <span className="text-[11px] text-zinc-600">{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION O: Service Utilization */}
        <section className="space-y-6 p-6 bg-zinc-50/50 rounded-2xl border border-zinc-100">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b border-zinc-200 pb-2">
            <Users size={18} className="text-partners-green" />
            <h3 className="uppercase tracking-tight text-sm">Section O. Service Utilization</h3>
          </div>
          
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="text-xs font-bold text-zinc-700 uppercase">1. Hospital Use (Last 90 Days)</label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Inpatient Stays</label>
                    <input type="number" {...register('serviceUtilization.hospitalUse.inpatientStays')} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">ER Visits</label>
                    <input type="number" {...register('serviceUtilization.hospitalUse.erVisits')} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-sm" />
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <label className="text-xs font-bold text-zinc-700 uppercase">2. Physician Visits (Last 90 Days)</label>
                <input type="number" {...register('serviceUtilization.physicianVisits')} className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-sm" />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-zinc-100">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-700 uppercase">3. Formal Care Services (Last 7 Days)</label>
                <Button type="button" variant="secondary" size="sm" onClick={() => appendCare({ service: '', days: '', hours: '', mins: '' })} className="h-7 text-[10px] gap-1">
                  <Plus size={12} /> Add Service
                </Button>
              </div>
              <div className="space-y-3">
                {careFields.map((field, index) => (
                  <div key={field.id} className="flex flex-col md:flex-row items-start md:items-center gap-2 bg-white p-3 rounded-xl border border-zinc-200">
                    <input {...register(`serviceUtilization.formalCare.${index}.service` as any)} placeholder="Service Name" className="flex-1 w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-xs" />
                    <div className="flex items-center gap-2 w-full md:w-auto">
                      <input {...register(`serviceUtilization.formalCare.${index}.days` as any)} placeholder="Days" className="w-16 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs text-center" />
                      <input {...register(`serviceUtilization.formalCare.${index}.hours` as any)} placeholder="Hrs" className="w-16 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs text-center" />
                      <input {...register(`serviceUtilization.formalCare.${index}.mins` as any)} placeholder="Min" className="w-16 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs text-center" />
                      <button type="button" onClick={() => removeCare(index)} className="text-red-500 hover:text-red-700 p-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION P: Medications */}
        <section className="space-y-6 p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b border-zinc-200 pb-2">
            <ClipboardCheck size={18} className="text-partners-green" />
            <h3 className="uppercase tracking-tight text-sm">Section P. Medications</h3>
          </div>
          
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="text-xs font-bold text-zinc-700 uppercase">1. Number of Medications</label>
                <input type="number" {...register('medications.numberOfMedications')} className="w-full px-4 py-2 rounded-xl border border-zinc-200 text-xs outline-none focus:ring-2 focus:ring-partners-blue-dark" />
              </div>
              <div className="space-y-4">
                <label className="text-xs font-bold text-zinc-700 uppercase">2. Psychotropic Medications (Last 7 Days)</label>
                <div className="grid grid-cols-2 gap-2 bg-zinc-50 p-4 rounded-xl">
                  {[
                    { id: 'antipsychotic', label: 'a. Antipsychotic' },
                    { id: 'anxiolytic', label: 'b. Anxiolytic' },
                    { id: 'antidepressant', label: 'c. Antidepressant' },
                    { id: 'hypnotic', label: 'd. Hypnotic' },
                  ].map(item => (
                    <label key={item.id} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" {...register(`medications.receiptOfPsychotropic.${item.id}` as any)} className="w-4 h-4 rounded" />
                      <span className="text-[11px] text-zinc-600">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-zinc-100">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-700 uppercase">3. Medication List</label>
                <Button type="button" variant="secondary" size="sm" onClick={() => appendMed({ name: '', dose: '', form: '', freq: '' })} className="h-7 text-[10px] gap-1">
                  <Plus size={12} /> Add Medication
                </Button>
              </div>
              <div className="space-y-3">
                {medFields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-1 md:grid-cols-5 gap-2 bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                    <input {...register(`medications.medicationList.${index}.name` as any)} placeholder="Medication Name" className="md:col-span-2 bg-white px-3 py-1.5 rounded-lg border border-zinc-200 text-xs" />
                    <input {...register(`medications.medicationList.${index}.dose` as any)} placeholder="Dose" className="bg-white px-3 py-1.5 rounded-lg border border-zinc-200 text-xs" />
                    <input {...register(`medications.medicationList.${index}.form` as any)} placeholder="Form" className="bg-white px-3 py-1.5 rounded-lg border border-zinc-200 text-xs" />
                    <div className="flex items-center gap-2">
                      <input {...register(`medications.medicationList.${index}.freq` as any)} placeholder="Freq" className="flex-1 bg-white px-3 py-1.5 rounded-lg border border-zinc-200 text-xs" />
                      <button type="button" onClick={() => removeMed(index)} className="text-red-500 hover:text-red-700 p-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION Q: Assessment Information */}
        <section className="space-y-6 p-6 bg-zinc-50/50 rounded-2xl border border-zinc-100">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b border-zinc-200 pb-2">
            <ClipboardCheck size={18} className="text-partners-green" />
            <h3 className="uppercase tracking-tight text-sm">Section Q. Assessment Information</h3>
          </div>
          
          <div className="space-y-4">
            <label className="text-xs font-bold text-zinc-700 uppercase">Assessment Summary / Clinical Notes</label>
            <textarea {...register('summary')} rows={6} className="w-full px-4 py-3 rounded-2xl border border-zinc-200 text-sm outline-none focus:ring-2 focus:ring-partners-blue-dark bg-white resize-none" placeholder="Enter clinical summary and assessment findings..." />
          </div>
        </section>

        {/* SECTION R: Signatures */}
        <section className="space-y-6 p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm">
          <div className="flex items-center gap-2 text-partners-blue-dark font-bold border-b border-zinc-200 pb-2">
            <Shield size={18} className="text-partners-green" />
            <h3 className="uppercase tracking-tight text-sm">Section R. Signatures</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-700 uppercase">Signatures of Persons Completing the Assessment</label>
              <Button type="button" variant="secondary" size="sm" onClick={() => appendSig({ signature: '', title: '', sections: '', date: new Date().toISOString().split('T')[0] })} className="h-7 text-[10px] gap-1">
                <Plus size={12} /> Add Signature
              </Button>
            </div>
            <div className="space-y-4">
              {sigFields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Signature/Name</label>
                    <input {...register(`signatures.${index}.signature` as any)} className="w-full bg-white px-3 py-1.5 rounded-lg border border-zinc-200 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Title</label>
                    <input {...register(`signatures.${index}.title` as any)} className="w-full bg-white px-3 py-1.5 rounded-lg border border-zinc-200 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Sections</label>
                    <input {...register(`signatures.${index}.sections` as any)} className="w-full bg-white px-3 py-1.5 rounded-lg border border-zinc-200 text-xs" />
                  </div>
                  <div className="space-y-1 relative">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Date</label>
                    <div className="flex items-center gap-2">
                      <input type="date" {...register(`signatures.${index}.date` as any)} className="flex-1 bg-white px-3 py-1.5 rounded-lg border border-zinc-200 text-xs" />
                      <button type="button" onClick={() => removeSig(index)} className="text-red-500 hover:text-red-700 p-1">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </form>

      {/* Notification Toast */}
      {notification && (
        <div className={clsx(
          "fixed bottom-8 right-8 z-[100] px-6 py-4 rounded-2xl shadow-2xl border animate-in slide-in-from-bottom-4 duration-300 flex items-center gap-3",
          notification.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-red-50 border-red-100 text-red-800"
        )}>
          {notification.type === 'success' ? (
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <CheckCircle className="text-emerald-600" size={18} />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <AlertCircle className="text-red-600" size={18} />
            </div>
          )}
          <p className="text-sm font-bold">{notification.message}</p>
          <button onClick={() => setNotification(null)} className="ml-4 text-zinc-400 hover:text-zinc-600">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
};