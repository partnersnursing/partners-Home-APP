import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { jsPDF } from "jspdf";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("CRITICAL: Supabase environment variables are missing!");
  console.error("Please add VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your platform Secrets.");
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const app = express();
app.use(cors());
app.use(express.json());

// Admin: Create User Endpoint
app.post("/api/admin/create-user", async (req, res) => {
    try {
      const { email, password, fullName, role } = req.body;
      
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName }
      });

      if (authError) throw authError;

      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ role, full_name: fullName })
        .eq('id', authData.user.id);

      if (profileError) throw profileError;

      res.json({ success: true, user: authData.user });
    } catch (error: any) {
      console.error("Admin Create User Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

// Admin: Edit User Endpoint (update name, role, and/or password)
app.post("/api/admin/edit-user", async (req, res) => {
  try {
    const { userId, fullName, role, password } = req.body;

    if (!userId) throw new Error("User ID is required");

    // 1. Update Auth user (email display name + optional password)
    const authUpdates: any = {
      user_metadata: { full_name: fullName },
    };
    if (password && password.trim().length > 0) {
      authUpdates.password = password;
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      authUpdates
    );
    if (authError) throw authError;

    // 2. Update profile (name + role)
    const profileUpdates: any = {};
    if (fullName) profileUpdates.full_name = fullName;
    if (role) profileUpdates.role = role;

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update(profileUpdates)
      .eq('id', userId);

    if (profileError) throw profileError;

    res.json({ success: true });
  } catch (error: any) {
    console.error("Admin Edit User Error:", error);
    res.status(500).json({ error: error.message });
  }
});

  // Admin: Delete User Endpoint
  app.post("/api/admin/delete-user", async (req, res) => {
    try {
      const { userId } = req.body;
      
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);

      if (authError) {
        const isUserNotFound = authError.message?.toLowerCase().includes('not found') || 
                              (authError as any).status === 404;

        if (isUserNotFound) {
          console.warn(`User ${userId} not found in Auth, attempting to delete from profiles...`);
          const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .delete()
            .eq('id', userId);
          
          if (profileError) throw profileError;
        } else {
          throw authError;
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Admin Delete User Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Database Setup Endpoint (Bypasses RLS using Service Role Key)
  app.post("/api/setup-database", async (req, res) => {
    try {
      console.log("Server: Starting database setup...");
      
      // 1. Seed Forms
      const formsToSeed = [
        { name: 'GAFC Progress Note', description: 'Monthly GAFC clinical progress note', schema: {} },
        { name: 'GAFC Care Plan', description: 'MassHealth GAFC Program Care Plan', schema: {} },
        { name: 'Physician Summary (PSF-1)', description: 'Physician summary for GAFC services', schema: {} },
        { name: 'Request for Services (RFS-1)', description: 'Request for GAFC services', schema: {} },
        { name: 'Patient Resource Data', description: 'Patient demographic and resource information', schema: {} },
        { name: 'Physician Orders', description: 'Physician orders for clinical care', schema: {} },
        { name: 'MDS Assessment', description: 'Minimum Data Set assessment', schema: {} },
        { name: 'Nursing Assessment', description: 'Comprehensive nursing assessment', schema: {} },
        { name: 'Medication Administration Record (MAR)', description: 'Monthly MAR tracking', schema: {} },
        { name: 'Treatment Administration Record (TAR)', description: 'Monthly TAR tracking', schema: {} },
        { name: 'Clinical Note', description: 'General clinical documentation', schema: {} },
        { name: 'Admission Assessment', description: 'Initial patient admission evaluation', schema: {} },
        { name: 'Discharge Summary', description: 'Final documentation upon patient discharge', schema: {} },
        { name: 'Home Safety Inspection', description: 'Home safety evaluation for patients', schema: {} },
        { name: 'Semi-Annual Health Status Report', description: 'GAFC bi-annual nursing review and PCP certification form.', schema: {} },
        { name: 'GAFC Aide Care Plan', description: 'Home Health Aide care plan covering ADLs, equipment, and service schedule.', schema: {} },
        { name: 'Medication List', description: 'Client medication record with dose, route, frequency, and review tracking.', schema: {} },
      ];

      for (const form of formsToSeed) {
        const { data: existingForm } = await supabaseAdmin
          .from('forms')
          .select('id')
          .eq('name', form.name)
          .maybeSingle();
        
        if (!existingForm) {
          await supabaseAdmin.from('forms').insert([form]);
        }
      }

      // 1.5 Ensure profiles exist for all users
      console.log("Server: Ensuring profiles exist for all users...");
      const { data: users, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
      
      if (!usersError && users?.users) {
        const allUsers = [...users.users];
        
        if (allUsers.length === 0) {
          console.log("Server: No users found, creating default admin...");
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: 'kianiisrarazam@gmail.com',
            password: 'Password123!',
            email_confirm: true,
            user_metadata: { full_name: 'Israr Azam Kiani' }
          });
          
          if (!createError && newUser?.user) {
            allUsers.push(newUser.user);
          }
        }

        for (const user of allUsers) {
          const { data: existingProfile } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .maybeSingle();
          
          if (!existingProfile) {
            await supabaseAdmin.from('profiles').insert([{
              id: user.id,
              full_name: user.user_metadata?.full_name || user.email,
              email: user.email,
              role: 'admin'
            }]);
          }
        }
      }

      // 1.6 Ensure dummy patient exists
      const DUMMY_PATIENT_ID = '00000000-0000-0000-0000-000000000000';
      const { data: existingDummy } = await supabaseAdmin
        .from('patients')
        .select('id')
        .eq('id', DUMMY_PATIENT_ID)
        .maybeSingle();
      
      if (!existingDummy) {
        await supabaseAdmin.from('patients').insert([{
          id: DUMMY_PATIENT_ID,
          first_name: 'System',
          last_name: 'Test Patient',
          dob: '1970-01-01',
          gender: 'other',
          phone: '000-000-0000',
          email: 'test@example.com',
          insurance_id: 'TEST-001'
        }]);
      }

      console.log("Server: Database setup completed successfully.");
      res.json({ success: true, message: 'Database setup completed successfully.' });
    } catch (error: any) {
      console.error("Server: Database Setup Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Patient: Create Endpoint (Bypasses RLS)
  app.post("/api/patients/create", async (req, res) => {
    try {
      console.log("Server: Creating patient with data:", JSON.stringify(req.body, null, 2));
      if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error("Supabase environment variables are missing on the server.");
      }

      if (req.body.other_provider_ids && typeof req.body.other_provider_ids === 'string') {
        const ids = req.body.other_provider_ids.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const validIds = ids.filter((id: string) => uuidRegex.test(id));
        req.body.other_provider_ids = validIds.length > 0 ? validIds : null;
      }

      const { data, error } = await supabaseAdmin
        .from('patients')
        .insert([req.body])
        .select();

      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      console.error("Server: Patient Create Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error", details: error });
    }
  });

  // Patient: Update Endpoint (Bypasses RLS)
  app.post("/api/patients/update", async (req, res) => {
    try {
      if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error("Supabase environment variables are missing on the server.");
      }

      const { id, ...patientData } = req.body;

      if (patientData.other_provider_ids && typeof patientData.other_provider_ids === 'string') {
        const ids = patientData.other_provider_ids.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const validIds = ids.filter((id: string) => uuidRegex.test(id));
        patientData.other_provider_ids = validIds.length > 0 ? validIds : null;
      }

      const { data, error } = await supabaseAdmin
        .from('patients')
        .update(patientData)
        .eq('id', id)
        .select();

      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      console.error("Server: Patient Update Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error", details: error });
    }
  });

  // Medical Provider: Create Endpoint (Bypasses RLS)
  app.post("/api/medical-providers/create", async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('medical_providers')
        .insert([req.body])
        .select();

      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Medical Provider: Update Endpoint (Bypasses RLS)
  app.post("/api/medical-providers/update", async (req, res) => {
    try {
      const { id, ...providerData } = req.body;
      if (!id) throw new Error("Provider ID is required");

      const { data, error } = await supabaseAdmin
        .from('medical_providers')
        .update(providerData)
        .eq('id', id)
        .select();

      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Medical Provider: Delete Endpoint (Bypasses RLS)
  app.post("/api/medical-providers/delete", async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) throw new Error("Provider ID is required");

      await supabaseAdmin.from('patients').update({ pcp_id: null }).eq('pcp_id', id);

      const { error } = await supabaseAdmin.from('medical_providers').delete().eq('id', id);
      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Patient: Delete Endpoint (Bypasses RLS and handles cleanup)
  app.post("/api/patients/delete", async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) throw new Error("Patient ID is required");

      const { data: forms } = await supabaseAdmin.from('form_responses').select('id').eq('patient_id', id);
      const { data: notes } = await supabaseAdmin.from('clinical_notes').select('id').eq('patient_id', id);
      
      const formIds = forms?.map(f => f.id) || [];
      const noteIds = notes?.map(n => n.id) || [];
      const allParentIds = [...formIds, ...noteIds];

      if (allParentIds.length > 0) {
        await supabaseAdmin.from('signatures').delete().in('parent_id', allParentIds);
      }

      await supabaseAdmin.from('form_responses').delete().eq('patient_id', id);
      await supabaseAdmin.from('clinical_notes').delete().eq('patient_id', id);
      await supabaseAdmin.from('visits').delete().eq('patient_id', id);
      await supabaseAdmin.from('files').delete().eq('patient_id', id);

      const { error } = await supabaseAdmin.from('patients').delete().eq('id', id);
      if (error) throw error;
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Server: Patient Delete Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Visit: Create Endpoint (Bypasses RLS)
  app.post("/api/visits/create", async (req, res) => {
    try {
      const statusMapping: Record<string, string> = {
        'Scheduled': 'scheduled',
        'Approved': 'approved',
        'Verified': 'reviewed'
      };
      
      const cancellationStatuses = [
        'Cancelled',
        'Client Cancelled – Health (MLOA)',
        'Client Cancelled – Non-Medical (NMLOA)',
        'Staff Cancelled',
        'Office Cancelled'
      ];

      if (req.body.status && cancellationStatuses.includes(req.body.status)) {
        if (!req.body.cancellation_reason) req.body.cancellation_reason = req.body.status;
        req.body.status = 'archived';
      } else if (req.body.status && statusMapping[req.body.status]) {
        req.body.status = statusMapping[req.body.status];
      }

      const { data, error } = await supabaseAdmin.from('visits').insert([req.body]).select();
      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Internal Server Error", details: error });
    }
  });

  // Visit: Update Endpoint (Bypasses RLS)
  app.post("/api/visits/update", async (req, res) => {
    try {
      const { id, ...visitData } = req.body;
      if (!id) throw new Error("Visit ID is required");

      const statusMapping: Record<string, string> = {
        'Scheduled': 'scheduled',
        'Approved': 'approved',
        'Verified': 'reviewed'
      };
      
      const cancellationStatuses = [
        'Cancelled',
        'Client Cancelled – Health (MLOA)',
        'Client Cancelled – Non-Medical (NMLOA)',
        'Staff Cancelled',
        'Office Cancelled'
      ];

      if (visitData.status && cancellationStatuses.includes(visitData.status)) {
        if (!visitData.cancellation_reason) visitData.cancellation_reason = visitData.status;
        visitData.status = 'archived';
      } else if (visitData.status && statusMapping[visitData.status]) {
        visitData.status = statusMapping[visitData.status];
      }

      const { data, error } = await supabaseAdmin.from('visits').update(visitData).eq('id', id).select();
      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Internal Server Error", details: error });
    }
  });

  // Visit: Delete Endpoint (Bypasses RLS)
  app.post("/api/visits/delete", async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) throw new Error("Visit ID is required");

      const { error } = await supabaseAdmin.from('visits').delete().eq('id', id);
      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Referral: Create Endpoint (Bypasses RLS)
  app.post("/api/referrals/create", async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from('referrals').insert([req.body]).select();
      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Referral: Update Endpoint (Bypasses RLS)
  app.post("/api/referrals/update", async (req, res) => {
    try {
      const { id, ...referralData } = req.body;
      if (!id) throw new Error("Referral ID is required");

      const { data, error } = await supabaseAdmin.from('referrals').update(referralData).eq('id', id).select();
      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Referral: Delete Endpoint (Bypasses RLS)
  app.post("/api/referrals/delete", async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) throw new Error("Referral ID is required");

      const { error } = await supabaseAdmin.from('referrals').delete().eq('id', id);
      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // PDF Generation Endpoint
  app.post("/api/generate-pdf", async (req, res) => {
    try {
      const { title, data, signatures } = req.body;
      
      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.text(title || "Clinical Document", 20, 20);
      
      doc.setFontSize(12);
      let y = 40;
      
      Object.entries(data || {}).forEach(([key, value]) => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(`${key}: ${value}`, 20, y);
        y += 10;
      });

      if (signatures && signatures.length > 0) {
        y += 20;
        signatures.forEach((sig: any) => {
          if (y > 250) { doc.addPage(); y = 20; }
          doc.text(`Signed by: ${sig.signer_name}`, 20, y);
          y += 5;
          if (sig.image) {
            doc.addImage(sig.image, 'PNG', 20, y, 50, 20);
            y += 25;
          }
        });
      }

      const pdfBuffer = doc.output('arraybuffer');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=document.pdf');
      res.send(Buffer.from(pdfBuffer));
    } catch (error) {
      console.error("PDF Generation Error:", error);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  });

// API 404 Handler
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: `API route ${req.method} ${req.url} not found` });
});

export default app;

async function startServer() {
  const isProd = process.env.NODE_ENV === "production";
  const PORT = 3000;
  
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite middleware loaded in development mode");
  } else {
    console.log("Serving static files in production mode");
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}