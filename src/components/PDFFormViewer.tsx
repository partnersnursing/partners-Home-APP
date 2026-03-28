/**
 * PDFFormViewer — Production-safe (Vercel / any host)
 *
 * SETUP (run once after npm install):
 *   cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs
 *
 * Or add to package.json scripts:
 *   "postinstall": "cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs"
 *
 * vite.config.ts — add these to prevent prod minification breaking instanceof:
 *   optimizeDeps: { exclude: ['pdfjs-dist'] }
 *   build.rollupOptions.output.manualChunks: { 'pdf-lib': ['pdf-lib'], 'pdfjs-dist': ['pdfjs-dist'] }
 *
 * DEPENDENCIES: npm install pdf-lib@1.17.1 pdfjs-dist
 *
 * FIXES APPLIED:
 *  1. pageDimsRef added so buildFilledBytes can read media-box offsets
 *  2. Signature stamp subtracts mbX/mbY — fixes wrong stamp position on saved PDF
 *  3. Name-based heuristic fallback for /Sig detection (survives prod minification)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, Download, FileText, AlertCircle,
  Send, X, CheckCircle, Loader2, ChevronDown,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import {
  PDFDocument, PDFName,
  PDFCheckBox, PDFTextField, PDFDropdown, PDFRadioGroup,
} from 'pdf-lib';
import { supabase } from '../services/supabase';

// ── Worker: static public file — works on Vercel and all hosts ───────────────
// Run: cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const RENDER_SCALE = 1.8;

// ── Types ─────────────────────────────────────────────────────────────────────
type FieldType = 'text' | 'multiline' | 'checkbox' | 'radio' | 'dropdown' | 'signature';

interface FieldInfo {
  name: string;
  valueKey: string;
  type: FieldType;
  pageIndex: number;
  /** Rect from pdfjs — pixel-accurate, matches canvas exactly */
  px1: number; py1: number; px2: number; py2: number;
  options?: string[];
  isComb?: boolean;
  combLen?: number;
  /** For radio buttons: the export value this specific widget represents */
  buttonValue?: string;
}

interface PageDim {
  width: number; height: number;
  mbX: number; mbY: number;
  rotation: number;
}

interface Patient { id: string; first_name: string; last_name: string; }

export interface PDFFormViewerProps {
  title: string;
  description: string;
  pdfPath: string;
  accentColor?: string;
  formName?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export const PDFFormViewer: React.FC<PDFFormViewerProps> = ({
  title, description, pdfPath,
  accentColor = 'bg-blue-100 text-blue-600',
  formName,
}) => {
  const navigate = useNavigate();

  const formValuesRef = useRef<Record<string, string>>({});
  const fieldsRef     = useRef<FieldInfo[]>([]);
  // FIX 1: pageDimsRef lets buildFilledBytes read media-box offsets
  // without being a stale closure over state.
  const pageDimsRef   = useRef<PageDim[]>([]);

  const [pageDims,   setPageDims]   = useState<PageDim[]>([]);
  const [fields,     setFields]     = useState<FieldInfo[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [pdfLoading, setPdfLoading] = useState(true);
  const [loadError,  setLoadError]  = useState<string | null>(null);
  const [containerW, setContainerW] = useState(0);

  formValuesRef.current = formValues;
  fieldsRef.current     = fields;

  const pdfjsDocRef  = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const canvasRefs   = useRef<Record<number, HTMLCanvasElement | null>>({});
  const renderTasks  = useRef<Record<number, { cancel(): void } | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Responsive scale ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setContainerW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxW     = pageDims.length ? Math.max(...pageDims.map(d => d.width)) : 1;
  const cssScale = containerW > 0 ? Math.min((containerW - 32) / maxW, 1) : 1;

  // ── Render one page ─────────────────────────────────────────────────────────
  const renderPage = useCallback(async (canvas: HTMLCanvasElement, idx: number) => {
    const doc = pdfjsDocRef.current;
    if (!doc) return;
    try { renderTasks.current[idx]?.cancel(); } catch {}
    renderTasks.current[idx] = null;
    try {
      const page     = await doc.getPage(idx + 1);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      canvas.width   = viewport.width;
      canvas.height  = viewport.height;
      const task = page.render({ canvasContext: canvas.getContext('2d')!, viewport });
      renderTasks.current[idx] = task;
      await task.promise;
    } catch (e: any) {
      if (e?.name !== 'RenderingCancelledException')
        console.warn('[PDFFormViewer] render error page', idx, e);
    } finally {
      renderTasks.current[idx] = null;
    }
  }, []);

  const setCanvasRef = useCallback((el: HTMLCanvasElement | null, idx: number) => {
    const prev = canvasRefs.current[idx];
    canvasRefs.current[idx] = el;
    if (el && el !== prev) renderPage(el, idx);
  }, [renderPage]);

  // ── Load PDF ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    Object.values(renderTasks.current).forEach(t => { try { t?.cancel(); } catch {} });
    renderTasks.current = {};
    canvasRefs.current  = {};
    pdfjsDocRef.current = null;
    setPdfLoading(true);
    setLoadError(null);
    setPageDims([]);
    setFields([]);
    setFormValues({});

    (async () => {
      try {
        // 1. Fetch bytes
        const res = await fetch(pdfPath);
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching "${pdfPath}"`);
        const ct = res.headers.get('content-type') ?? '';
        if (ct.includes('text/html'))
          throw new Error(`"${pdfPath}" returned HTML — check the file exists in /public/`);
        const buffer = await res.arrayBuffer();
        const bytes  = new Uint8Array(buffer);
        if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46)
          throw new Error(`"${pdfPath}" is not a valid PDF file.`);
        if (!active) return;

        // 2. Load pdfjs — use a copy so pdfjs worker transfer doesn't detach original bytes
        const pdfjsDoc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
        if (!active) return;
        pdfjsDocRef.current = pdfjsDoc;

        // 3. Build rect → page map from pdfjs annotations.
        // pdfjs directly parses /FT, /Ff flags so fieldType/checkBox/radioButton
        // are 100% reliable — no minification risk, no name guessing needed.
        type RectInfo = {
          pageIndex: number;
          pdfjsRect: number[];
          fieldType: string;    // 'Tx' | 'Btn' | 'Ch' | 'Sig'
          checkBox: boolean;
          radioButton: boolean;
          fieldName: string;
          buttonValue: string;  // export value for radio button widgets
        };
        const rectInfoMap = new Map<string, RectInfo>();
        const dims: PageDim[] = [];

        for (let i = 0; i < pdfjsDoc.numPages; i++) {
          const pdfjsPage = await pdfjsDoc.getPage(i + 1);
          const vp        = pdfjsPage.getViewport({ scale: RENDER_SCALE });
          const view      = (pdfjsPage as any).view as [number, number, number, number];
          dims.push({
            width: vp.width, height: vp.height,
            mbX: view[0], mbY: view[1],
            rotation: (pdfjsPage as any).rotate ?? 0,
          });
          const annots = await pdfjsPage.getAnnotations();
          for (const annot of annots) {
            if (annot.subtype === 'Widget' && annot.rect) {
              const r   = annot.rect as number[];
              const key = `${Math.round(r[0])}_${Math.round(r[1])}_${Math.round(r[2])}_${Math.round(r[3])}`;
              rectInfoMap.set(key, {
                pageIndex:   i,
                pdfjsRect:   r,
                fieldType:   (annot as any).fieldType   ?? '',
                checkBox:    (annot as any).checkBox    ?? false,
                radioButton: (annot as any).radioButton ?? false,
                fieldName:   (annot as any).fieldName   ?? '',
                // buttonValue is the export value pdfjs gives each radio widget
                buttonValue: (annot as any).buttonValue ?? (annot as any).exportValue ?? '',
              });
            }
          }
        }
        if (!active) return;

        // 4. Extract AcroForm fields with pdf-lib
        const extracted: FieldInfo[]           = [];
        const initVals: Record<string, string> = {};
        let pdfLibDoc: PDFDocument | null = null;

        try {
          pdfLibDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        } catch (e) {
          console.warn('[PDFFormViewer] pdf-lib load() failed (prod minification or malformed PDF):', e);
        }

        if (pdfLibDoc) {
          let libFields: ReturnType<typeof pdfLibDoc.getForm>['getFields'] extends () => infer R ? R : never = [];
          try { libFields = pdfLibDoc.getForm().getFields(); } catch (e) {
            console.warn('[PDFFormViewer] getForm().getFields() failed:', e);
          }

          for (const field of libFields) {
            try {
              const name    = field.getName();
              const widgets = field.acroField.getWidgets();
              // pdf-lib fallback type — used only when pdfjs annotation lookup misses
              let libType: FieldType = 'text';
              let options: string[] | undefined;

              if      (field instanceof PDFCheckBox)   libType = 'checkbox';
              else if (field instanceof PDFRadioGroup) { libType = 'radio'; options = (field as any).getOptions?.() ?? []; }
              else if (field instanceof PDFDropdown)   { libType = 'dropdown'; options = (field as any).getOptions?.() ?? []; }
              else if (field instanceof PDFTextField)  libType = (field as any).isMultiline?.() ? 'multiline' : 'text';
              else {
                try {
                  const ft = field.acroField.dict.get(PDFName.of('FT'));
                  if (ft?.toString() === '/Sig') libType = 'signature';
                } catch {}
              }

              let isComb = false, combLen = 0;
              try {
                if (field instanceof PDFTextField && widgets.length === 1) {
                  const flags       = field.acroField.getFlags();
                  const hasCombFlag = (flags & (1 << 24)) !== 0;
                  const maxLen      = field.acroField.getMaxLength();
                  if (hasCombFlag && maxLen && maxLen > 1) { isComb = true; combLen = maxLen; }
                }
              } catch {}

              const multiWidget = widgets.length > 1;
              for (const widget of widgets) {
                try {
                  const rect = widget.getRectangle();
                  const x2   = rect.x + rect.width;
                  const y2   = rect.y + rect.height;
                  const key  = `${Math.round(rect.x)}_${Math.round(rect.y)}_${Math.round(x2)}_${Math.round(y2)}`;
                  let info   = rectInfoMap.get(key);
                  if (!info) {
                    for (const [k, v] of rectInfoMap) {
                      const p = k.split('_').map(Number);
                      if (Math.abs(p[0]-rect.x)<2 && Math.abs(p[1]-rect.y)<2 &&
                          Math.abs(p[2]-x2)<2     && Math.abs(p[3]-y2)<2) { info = v; break; }
                    }
                  }
                  const pageIndex = info?.pageIndex ?? 0;
                  const pr        = info?.pdfjsRect ?? [rect.x, rect.y, x2, y2];

                  // DEFINITIVE TYPE RESOLUTION — pdfjs annotation data is the ground truth.
                  let effectiveType: FieldType = libType;
                  if (info) {
                    if      (info.fieldType === 'Sig')  effectiveType = 'signature';
                    else if (info.checkBox)             effectiveType = 'checkbox';
                    else if (info.radioButton)          effectiveType = 'radio';
                    else if (info.fieldType === 'Ch')   effectiveType = libType === 'dropdown' ? 'dropdown' : 'radio';
                    else if (info.fieldType === 'Tx')   effectiveType = libType === 'multiline' ? 'multiline' : 'text';
                  }

                  // Radio widgets in a group all share the same field name and must use
                  // name (not the per-widget x/y key) so formValues[name] holds ONE
                  // selected value for the whole group. multiWidget key is kept for all
                  // other multi-widget field types (e.g. split text fields).
                  const valueKey = (effectiveType === 'radio')
                    ? name
                    : (multiWidget ? `${name}__${Math.round(rect.x)}__${Math.round(rect.y)}` : name);

                  const buttonValue = info?.buttonValue ?? '';

                  extracted.push({
                    name, valueKey, type: effectiveType, pageIndex,
                    px1: pr[0], py1: pr[1], px2: pr[2], py2: pr[3],
                    options, isComb, combLen, buttonValue,
                  });

                  if (!(valueKey in initVals)) initVals[valueKey] = effectiveType === 'checkbox' ? 'false' : '';
                } catch (e) { console.warn('[PDFFormViewer] widget error:', e); }
              }
            } catch (e) { console.warn('[PDFFormViewer] field error:', e); }
          }
        }

        if (!active) return;
        setFields(extracted);
        setFormValues(initVals);

        // FIX 1: Keep pageDimsRef in sync so buildFilledBytes sees fresh dims
        pageDimsRef.current = dims;
        setPageDims(dims);

      } catch (err: any) {
        console.error('[PDFFormViewer] load error:', err);
        if (active) setLoadError(err?.message ?? 'Unknown error loading PDF');
      } finally {
        if (active) setPdfLoading(false);
      }
    })();

    return () => { active = false; };
  }, [pdfPath]);

  // ── Build filled PDF bytes (re-fetch for freshness) ──────────────────────────
  const buildFilledBytes = useCallback(async (): Promise<Uint8Array> => {
    const res = await fetch(pdfPath);
    if (!res.ok) throw new Error(`Cannot fetch PDF: HTTP ${res.status}`);
    const src = new Uint8Array(await res.arrayBuffer());
    if (src[0] !== 0x25 || src[1] !== 0x50 || src[2] !== 0x44 || src[3] !== 0x46)
      throw new Error('Fetched file is not a valid PDF.');

    let doc: PDFDocument;
    try {
      doc = await PDFDocument.load(src, { ignoreEncryption: true });
    } catch (e: any) {
      throw new Error(`pdf-lib could not parse this PDF: ${e?.message}. Try downloading directly.`);
    }

    const form     = doc.getForm();
    const vals     = formValuesRef.current;
    const snapshot = fieldsRef.current;

    for (const field of form.getFields()) {
      try {
        const name    = field.getName();
        const entries = snapshot.filter(f => f.name === name);
        if (!entries.length) continue;

        if (field instanceof PDFTextField) {
          if (entries.length === 1) {
            (field as any).setText(vals[entries[0].valueKey] ?? '');
          } else {
            const combined = entries
              .sort((a, b) => a.px1 - b.px1 || a.py1 - b.py1)
              .map(e => vals[e.valueKey] ?? '')
              .join('');
            (field as any).setText(combined);
          }
        } else if (field instanceof PDFCheckBox) {
          const v = vals[entries[0].valueKey] ?? 'false';
          (field as any)[v === 'true' ? 'check' : 'uncheck']();
        } else if (field instanceof PDFDropdown) {
          const v = vals[entries[0].valueKey] ?? '';
          if (v) (field as any).select(v);
        } else if (field instanceof PDFRadioGroup) {
          const v = vals[entries[0].valueKey] ?? '';
          if (v) (field as any).select(v);
        }
      } catch (e) {
        console.warn(`[PDFFormViewer] skipping field "${field.getName?.()}":`, e);
      }
    }

    // Stamp signature images onto the PDF pages
    const sigEntries = snapshot.filter(f => f.type === 'signature' && vals[f.valueKey]);
    for (const entry of sigEntries) {
      try {
        const dataUrl = vals[entry.valueKey];
        if (!dataUrl?.startsWith('data:image/png')) continue;

        const base64   = dataUrl.split(',')[1];
        const imgBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const pngImage = await doc.embedPng(imgBytes);

        const pages = doc.getPages();
        const page  = pages[entry.pageIndex];
        if (!page) continue;

        // FIX 3: Subtract media-box origin from stored pdfjs rect coords.
        // pdfjs annotates rects in absolute PDF user-space; pdf-lib drawImage
        // uses page-local space (origin = media-box bottom-left).
        const dim = pageDimsRef.current[entry.pageIndex];
        const mbX = dim?.mbX ?? 0;
        const mbY = dim?.mbY ?? 0;

        page.drawImage(pngImage, {
          x:      entry.px1 - mbX,
          y:      entry.py1 - mbY,
          width:  entry.px2 - entry.px1,
          height: entry.py2 - entry.py1,
        });
      } catch (e) {
        console.warn('[PDFFormViewer] could not stamp signature:', e);
      }
    }

    return doc.save();
  }, [pdfPath]); // pageDimsRef is a stable ref — intentionally excluded from deps

  // ── Reset ────────────────────────────────────────────────────────────────────
  const resetForm = useCallback(() => {
    setFormValues(prev => {
      const blank: Record<string, string> = {};
      for (const k of Object.keys(prev))
        blank[k] = prev[k] === 'true' || prev[k] === 'false' ? 'false' : '';
      return blank;
    });
  }, []);

  // ── Download → print dialog ──────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    try {
      const filled  = await buildFilledBytes();
      const blobUrl = URL.createObjectURL(new Blob([filled], { type: 'application/pdf' }));
      const frame   = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;top:-9999px;';
      frame.src = blobUrl;
      document.body.appendChild(frame);
      frame.onload = () => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        setTimeout(() => { document.body.removeChild(frame); URL.revokeObjectURL(blobUrl); }, 3000);
      };
    } catch (err: any) {
      console.error('[PDFFormViewer] download error', err);
      alert(`Download failed: ${err?.message}`);
    }
  }, [buildFilledBytes]);

  // ── Submit modal ─────────────────────────────────────────────────────────────
  const [showModal,         setShowModal]         = useState(false);
  const [patients,          setPatients]          = useState<Patient[]>([]);
  const [patientsLoading,   setPatientsLoading]   = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [notes,             setNotes]             = useState('');
  const [isSubmitting,      setIsSubmitting]      = useState(false);
  const [submitResult,      setSubmitResult]      = useState<
    { type: 'success' | 'error'; message: string } | null
  >(null);

  useEffect(() => {
    if (!showModal) return;
    setPatientsLoading(true);
    supabase.from('patients').select('id, first_name, last_name').order('last_name')
      .then(({ data }) => { setPatients(data ?? []); setPatientsLoading(false); });
  }, [showModal]);

  const closeModal = () => {
    setShowModal(false);
    setSelectedPatientId('');
    setNotes('');
    setSubmitResult(null);
  };

  const handleSubmit = async () => {
    if (!selectedPatientId) return;
    setIsSubmitting(true);
    setSubmitResult(null);
    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) throw new Error('Not authenticated — please log in again.');

      const filled      = await buildFilledBytes();
      const slug        = (formName ?? title).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const storagePath = `${slug}/${selectedPatientId}/${Date.now()}.pdf`;

      const { error: upErr } = await supabase.storage
        .from('pdf-submissions')
        .upload(storagePath, filled, { contentType: 'application/pdf', upsert: false });
      if (upErr) throw upErr;

      const { data: formRec } = await supabase
        .from('forms').select('id').eq('name', formName ?? title).maybeSingle();

      const { error: dbErr } = await supabase.from('form_responses').insert({
        form_id:      formRec?.id ?? null,
        patient_id:   selectedPatientId,
        staff_id:     user.id,
        status:       'submitted',
        storage_path: storagePath,
        notes:        notes.trim() || null,
        data: {
          form_name:    formName ?? title,
          submitted_at: new Date().toISOString(),
          storage_path: storagePath,
        },
      });
      if (dbErr) throw dbErr;

      resetForm();
      setSubmitResult({ type: 'success', message: 'Submitted!' });
    } catch (err: any) {
      console.error('[PDFFormViewer] submit error', err);
      setSubmitResult({ type: 'error', message: err?.message ?? 'Unexpected error.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Field overlay ─────────────────────────────────────────────────────────────
  const renderOverlay = (field: FieldInfo, dim: PageDim) => {
    const pageHpt = dim.height / RENDER_SCALE;
    const pageWpt = dim.width  / RENDER_SCALE;
    const x1 = field.px1 - dim.mbX;
    const y1 = field.py1 - dim.mbY;
    const x2 = field.px2 - dim.mbX;
    const y2 = field.py2 - dim.mbY;
    const fw = x2 - x1;
    const fh = y2 - y1;

    let left: number, top: number, width: number, height: number;
    if (dim.rotation === 90) {
      left = y1 * RENDER_SCALE; top = (pageWpt - x2) * RENDER_SCALE; width = fh * RENDER_SCALE; height = fw * RENDER_SCALE;
    } else if (dim.rotation === 180) {
      left = (pageWpt - x2) * RENDER_SCALE; top = (pageHpt - y2) * RENDER_SCALE; width = fw * RENDER_SCALE; height = fh * RENDER_SCALE;
    } else if (dim.rotation === 270) {
      left = (pageHpt - y2) * RENDER_SCALE; top = x1 * RENDER_SCALE; width = fh * RENDER_SCALE; height = fw * RENDER_SCALE;
    } else {
      left = x1 * RENDER_SCALE; top = (pageHpt - y2) * RENDER_SCALE; width = fw * RENDER_SCALE; height = fh * RENDER_SCALE;
    }

    const fs  = Math.max(8, Math.min(height * 0.58, 13));
    const key = `${field.name}__${field.pageIndex}__${field.px1}__${field.py1}`;
    const style: React.CSSProperties = { position: 'absolute', left, top, width, height };

    const base: React.CSSProperties = {
      width: '100%', height: '100%',
      background: 'transparent', border: 'none', outline: 'none',
      color: '#18181b', fontSize: fs, padding: '0 2px',
      boxSizing: 'border-box', cursor: 'text',
    };

    const focusOn  = (e: React.FocusEvent<any>) => e.currentTarget.style.background = 'rgba(219,234,254,0.35)';
    const focusOff = (e: React.FocusEvent<any>) => e.currentTarget.style.background = 'transparent';

    // ── Checkbox ──
    if (field.type === 'checkbox') {
      const checked = formValues[field.valueKey] === 'true';
      return (
        <div
          key={key}
          style={{ ...style, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setFormValues(p => ({ ...p, [field.valueKey]: checked ? 'false' : 'true' }))}
          title={checked ? 'Click to uncheck' : 'Click to check'}
        >
          {checked && (
            <svg viewBox="0 0 12 12" style={{ width: Math.min(width, height) * 0.82, height: Math.min(width, height) * 0.82, pointerEvents: 'none' }}>
              <polyline points="1.5,6 4.5,9.5 10.5,2.5" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      );
    }

    // ── Signature pad ──
    if (field.type === 'signature') {
      return (
        <SignaturePad
          key={key}
          fieldKey={field.valueKey}
          style={style}
          value={formValues[field.valueKey] ?? ''}
          onChange={v => setFormValues(p => ({ ...p, [field.valueKey]: v }))}
        />
      );
    }

    // ── Radio button ──
    // Each widget in the group has its own buttonValue. Clicking selects that value
    // for the shared field name (valueKey === name for all widgets in the group).
    if (field.type === 'radio') {
      const isSelected = formValues[field.valueKey] === field.buttonValue;
      return (
        <div
          key={key}
          style={{
            ...style,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() =>
            setFormValues(p => ({
              ...p,
              [field.valueKey]: isSelected ? '' : (field.buttonValue ?? ''),
            }))
          }
          title={isSelected ? 'Click to deselect' : 'Click to select'}
        >
          {isSelected && (
            <svg
              viewBox="0 0 12 12"
              style={{
                width:  Math.min(width, height) * 0.72,
                height: Math.min(width, height) * 0.72,
                pointerEvents: 'none',
              }}
            >
              <circle cx="6" cy="6" r="3.5" fill="#2563eb" />
            </svg>
          )}
        </div>
      );
    }

    // ── Dropdown ──
    if (field.type === 'dropdown' && field.options?.length) {
      return (
        <div key={key} style={style}>
          <select
            value={formValues[field.valueKey] ?? ''}
            onChange={e => setFormValues(p => ({ ...p, [field.valueKey]: e.target.value }))}
            onFocus={focusOn} onBlur={focusOff}
            style={{ ...base, cursor: 'pointer' }}
          >
            <option value="">—</option>
            {field.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }

    // ── Multiline ──
    if (field.type === 'multiline') {
      return (
        <div key={key} style={style}>
          <textarea
            value={formValues[field.valueKey] ?? ''}
            onChange={e => setFormValues(p => ({ ...p, [field.valueKey]: e.target.value }))}
            onFocus={focusOn} onBlur={focusOff}
            style={{ ...base, resize: 'none', lineHeight: 1.3, padding: '1px 2px' }}
          />
        </div>
      );
    }

    // ── Comb field ──
    if (field.isComb && field.combLen) {
      const n       = field.combLen;
      const boxW    = width / n;
      const current = formValues[field.valueKey] ?? '';
      return (
        <div key={key} style={{ ...style, display: 'flex' }}>
          {Array.from({ length: n }, (_, ci) => {
            const charVal = current[ci] ?? '';
            return (
              <input
                key={ci} type="text" maxLength={1} value={charVal}
                onChange={e => {
                  const ch    = e.target.value.slice(-1);
                  const chars = (formValues[field.valueKey] ?? '').split('');
                  chars[ci]   = ch;
                  setFormValues(p => ({ ...p, [field.valueKey]: chars.join('').trimEnd() }));
                  if (ch && e.target.nextElementSibling)
                    (e.target.nextElementSibling as HTMLInputElement).focus();
                }}
                onKeyDown={e => {
                  if (e.key === 'Backspace' && !charVal && e.currentTarget.previousElementSibling)
                    (e.currentTarget.previousElementSibling as HTMLInputElement).focus();
                }}
                onFocus={focusOn} onBlur={focusOff}
                style={{
                  width: boxW, height,
                  fontSize: Math.max(8, Math.min(height * 0.65, 14)),
                  textAlign: 'center', padding: 0,
                  background: 'transparent', border: 'none', outline: 'none',
                  color: '#18181b', boxSizing: 'border-box',
                }}
              />
            );
          })}
        </div>
      );
    }

    // ── Text (single-char narrow or regular) ──
    const isSingleChar = (field.px2 - field.px1) < 18;
    return (
      <div key={key} style={style}>
        <input
          type="text"
          value={formValues[field.valueKey] ?? ''}
          maxLength={isSingleChar ? 1 : undefined}
          onChange={e => setFormValues(p => ({
            ...p,
            [field.valueKey]: isSingleChar ? e.target.value.slice(-1) : e.target.value,
          }))}
          onFocus={focusOn} onBlur={focusOff}
          style={{
            ...base,
            fontSize:  isSingleChar ? Math.max(8, Math.min(height * 0.65, 14)) : fs,
            textAlign: isSingleChar ? 'center' : 'left',
            padding:   isSingleChar ? '0' : '0 2px',
          }}
        />
      </div>
    );
  };

  const filledCount = Object.values(formValues).filter(v => v !== '' && v !== 'false').length;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/clinical-forms')}
          className="p-2 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 italic">{title}</h1>
          <p className="text-sm text-zinc-500">{description}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-zinc-200 px-5 py-3 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 rounded-xl flex-shrink-0 ${accentColor}`}><FileText size={18} /></div>
          <span className="text-sm font-semibold text-zinc-700 truncate">{title}</span>
          {!pdfLoading && fields.length > 0 && (
            <span className="text-xs text-zinc-400 flex-shrink-0">{filledCount}/{fields.length} filled</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {filledCount > 0 && (
            <button
              onClick={resetForm}
              className="px-3 py-2 text-xs font-medium text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
            >
              Clear
            </button>
          )}
          <button
            onClick={handleDownload}
            disabled={pdfLoading || !!loadError}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={16} /><span className="hidden sm:inline">Download</span>
          </button>
          <button
            onClick={() => setShowModal(true)}
            disabled={pdfLoading || !!loadError}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-partners-blue-dark hover:opacity-90 rounded-xl transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={16} /><span className="hidden sm:inline">Submit</span>
          </button>
        </div>
      </div>

      {/* PDF Canvas viewer */}
      <div ref={containerRef} className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        {pdfLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="animate-spin text-partners-blue-dark" size={32} />
            <p className="text-sm text-zinc-400">Loading form…</p>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-24 text-center px-6">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="text-red-400" size={32} />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 mb-2 italic">Could not load PDF</h3>
            <p className="text-zinc-500 text-sm max-w-md font-mono bg-zinc-50 p-3 rounded-xl">{loadError}</p>
          </div>
        ) : (
          <div
            className="overflow-y-auto bg-zinc-200 p-4 space-y-4"
            style={{ maxHeight: 'calc(100vh - 280px)', minHeight: 600 }}
          >
            {pageDims.map((dim, i) => (
              <div
                key={i}
                className="mx-auto"
                style={{ width: dim.width * cssScale, height: dim.height * cssScale, position: 'relative' }}
              >
                <div style={{
                  width: dim.width, height: dim.height,
                  transform: `scale(${cssScale})`, transformOrigin: 'top left',
                  position: 'relative', background: '#fff',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
                }}>
                  <canvas
                    ref={el => setCanvasRef(el, i)}
                    style={{ display: 'block', position: 'absolute', top: 0, left: 0 }}
                  />
                  {fields.filter(f => f.pageIndex === i).map(f => renderOverlay(f, dim))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info banner */}
      {!loadError && !pdfLoading && (
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 text-sm text-blue-700">
          <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
          <p>
            Click any field on the PDF to fill it. <strong>Download</strong> opens the print dialog (Save as PDF).{' '}
            <strong>Submit</strong> saves to the patient record and resets the form.
          </p>
        </div>
      )}

      {/* Submit Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${accentColor}`}><Send size={18} /></div>
                <div>
                  <h2 className="text-base font-bold text-zinc-900">Submit Form</h2>
                  <p className="text-xs text-zinc-500">{title}</p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-2 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {submitResult?.type === 'success' ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-4">
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center">
                  <CheckCircle className="text-emerald-500" size={32} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 mb-1">Submitted!</h3>
                  <p className="text-sm text-zinc-500">Saved to patient record. Form has been reset.</p>
                </div>
                <button
                  onClick={closeModal}
                  className="mt-2 px-6 py-2.5 text-sm font-medium text-white bg-partners-blue-dark hover:opacity-90 rounded-xl"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="px-6 py-5 space-y-5">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    Patient <span className="text-red-500">*</span>
                  </label>
                  {patientsLoading ? (
                    <div className="flex items-center gap-2 h-10 text-sm text-zinc-400">
                      <Loader2 size={16} className="animate-spin" /> Loading patients…
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        value={selectedPatientId}
                        onChange={e => setSelectedPatientId(e.target.value)}
                        className="w-full appearance-none px-4 py-2.5 pr-10 text-sm bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-900 focus:outline-none focus:ring-2 focus:ring-partners-blue-dark/30 focus:border-partners-blue-dark transition-colors"
                      >
                        <option value="">Select a patient…</option>
                        {patients.map(p => (
                          <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    Notes <span className="text-zinc-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Any additional notes…"
                    rows={3}
                    className="w-full px-4 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-partners-blue-dark/30 focus:border-partners-blue-dark transition-colors resize-none"
                  />
                </div>

                {submitResult?.type === 'error' && (
                  <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    <AlertCircle size={16} className="flex-shrink-0" />{submitResult.message}
                  </div>
                )}

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={closeModal}
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!selectedPatientId || isSubmitting}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-partners-blue-dark hover:opacity-90 rounded-xl transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting
                      ? <><Loader2 size={16} className="animate-spin" /> Submitting…</>
                      : <><Send size={16} /> Submit</>
                    }
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── SignaturePad ──────────────────────────────────────────────────────────────
// A drawable canvas that sits transparently over a PDF signature field.
// Stores the drawing as a PNG data URL (used by buildFilledBytes to stamp it).
interface SignaturePadProps {
  fieldKey: string;
  style: React.CSSProperties;
  value: string;       // PNG data URL or ''
  onChange: (v: string) => void;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ fieldKey, style, value, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing   = useRef(false);
  const lastPos   = useRef<{ x: number; y: number } | null>(null);
  const hasDrawn  = useRef(false);

  const parseNum = (v: any, fallback: number) => {
    if (typeof v === 'number') return Math.round(v);
    if (typeof v === 'string') return Math.round(parseFloat(v)) || fallback;
    return fallback;
  };

  const canvasW = parseNum(style.width,  200);
  const canvasH = parseNum(style.height,  60);

  // Restore saved signature when value changes externally (e.g. after clear)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (value?.startsWith('data:image/png')) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = value;
      hasDrawn.current = true;
    } else {
      hasDrawn.current = false;
    }
  }, [value]);

  const getPos = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = '#18181b';
      ctx.lineWidth   = 1.5;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing.current || !lastPos.current) return;
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext('2d')!;
    const pos    = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current  = pos;
    hasDrawn.current = true;
  };

  const endDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing.current) return;
    drawing.current = false;
    lastPos.current = null;
    if (hasDrawn.current && canvasRef.current) {
      onChange(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clearSig = (e: React.MouseEvent) => {
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
    onChange('');
  };

  const isEmpty = !value?.startsWith('data:image/png');

  return (
    <div style={{ ...style, cursor: 'crosshair', position: 'absolute' }}>
      <canvas
        ref={canvasRef}
        width={canvasW}
        height={canvasH}
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      {/* Placeholder hint when empty */}
      {isEmpty && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
          color: 'rgba(100,116,139,0.5)',
          fontSize: Math.min(canvasH * 0.28, 11),
          fontStyle: 'italic',
        }}>
          Sign here
        </div>
      )}
      {/* Clear button — only shown when there's a drawing */}
      {!isEmpty && (
        <button
          onClick={clearSig}
          title="Clear signature"
          style={{
            position: 'absolute', top: 1, right: 1,
            background: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(203,213,225,0.8)',
            borderRadius: 4, padding: '0 4px',
            fontSize: 9, color: '#64748b', cursor: 'pointer',
            lineHeight: '14px',
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
};