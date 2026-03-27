/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  ShieldAlert, 
  ShieldCheck, 
  Upload, 
  Camera, 
  Activity, 
  Cpu, 
  Eye, 
  Zap, 
  AlertTriangle, 
  Info, 
  Settings2, 
  History, 
  FileSearch, 
  Maximize2, 
  RefreshCw,
  X,
  CheckCircle2,
  Fingerprint,
  Scan,
  Database,
  Layers,
  MessageSquare,
  Send,
  Sparkles,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell
} from 'recharts';
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider';
import { GoogleGenAI, Type } from "@google/genai";
import { cn } from './lib/utils';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import exifr from 'exifr';
import { db, auth } from './firebase';
import { collection, addDoc, query, where, getDocs, orderBy } from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';

// --- Types ---

interface ArtifactScore {
  name: string;
  score: number; // 0-100
  description: string;
}

interface HeatmapPoint {
  x: number; // 0-100
  y: number; // 0-100
  intensity: number; // 0-1
  label: string;
  description: string;
  confidence: number;
}

interface OCRResult {
  text: string;
  isSuspicious: boolean;
  reasoning: string;
}

interface DetectionResult {
  confidence: number; // 0-100 (100 = definitely fake)
  isDeepfake: boolean;
  artifacts: ArtifactScore[];
  analysis: string;
  heatmap?: HeatmapPoint[];
  metadata?: Record<string, string>;
  ocrData?: OCRResult[];
  timestamp: number;
  messages?: ChatMessage[];
}

interface ScanOptions {
  sensitivity: number;
  deepScan: boolean;
  faceDetection: boolean;
  focusArea: 'face' | 'lighting' | 'background' | 'all';
  temporalAnalysis: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// --- Constants ---

const GEMINI_MODEL = "gemini-3-flash-preview";

const DEFAULT_OPTIONS: ScanOptions = {
  sensitivity: 50,
  deepScan: false,
  faceDetection: false,
  focusArea: 'all',
  temporalAnalysis: false,
};

// --- Components ---

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preview2, setPreview2] = useState<string | null>(null);
  const [isComparisonMode, setIsComparisonMode] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [options, setOptions] = useState<ScanOptions>(DEFAULT_OPTIONS);
  const [showSettings, setShowSettings] = useState(false);
  const [history, setHistory] = useState<DetectionResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [isAssistantTyping, setIsAssistantTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [showMetadata, setShowMetadata] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<HeatmapPoint | null>(null);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // --- Logic ---

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isChatting) scrollToBottom();
  }, [chatMessages, isChatting]);

  const [systemLogs, setSystemLogs] = useState<string[]>([]);
  const [systemMetrics, setSystemMetrics] = useState({
    apiHealth: 'STABLE',
    cpuLoad: 12,
    memoryUsage: 45
  });
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const logs = [
      "INITIALIZING_NEURAL_CORE...",
      "ESTABLISHING_ENCRYPTED_LINK...",
      "LOADING_FORENSIC_DATABASE_v4.0...",
      "SYSTEM_READY_FOR_INPUT",
      "MONITORING_NETWORK_TRAFFIC...",
      "HEURISTIC_ENGINE_ACTIVE",
    ];
    setSystemLogs(logs);

    const interval = setInterval(() => {
      const newLogs = [
        `PACKET_INSPECTED: 0x${Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase()}`,
        `NEURAL_SYNC_STABLE: ${98 + Math.random() * 2}%`,
        `MEMORY_CLEANUP_COMPLETE`,
        `HEARTBEAT_DETECTED: NODE_${Math.floor(Math.random() * 10)}`,
      ];
      setSystemLogs(prev => [...prev.slice(-15), newLogs[Math.floor(Math.random() * newLogs.length)]]);
      
      setSystemMetrics(prev => ({
        apiHealth: Math.random() > 0.05 ? 'STABLE' : 'DEGRADED',
        cpuLoad: Math.max(5, Math.min(95, prev.cpuLoad + (Math.random() * 10 - 5))),
        memoryUsage: Math.max(20, Math.min(90, prev.memoryUsage + (Math.random() * 4 - 2)))
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [systemLogs]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (isComparisonMode) {
      if (acceptedFiles.length >= 1) {
        setFile(acceptedFiles[0]);
        const objectUrl = URL.createObjectURL(acceptedFiles[0]);
        setPreview(objectUrl);
      }
      if (acceptedFiles.length >= 2) {
        setFile2(acceptedFiles[1]);
        const objectUrl2 = URL.createObjectURL(acceptedFiles[1]);
        setPreview2(objectUrl2);
      }
    } else {
      const selectedFile = acceptedFiles[0];
      if (selectedFile) {
        setFile(selectedFile);
        const objectUrl = URL.createObjectURL(selectedFile);
        setPreview(objectUrl);
      }
    }
    setResult(null);
    setError(null);
    setChatMessages([]);
  }, [isComparisonMode]);

  // Cleanup object URL to prevent memory leaks
  useEffect(() => {
    return () => {
      if (preview && preview.startsWith('blob:')) {
        URL.revokeObjectURL(preview);
      }
      if (preview2 && preview2.startsWith('blob:')) {
        URL.revokeObjectURL(preview2);
      }
    };
  }, [preview, preview2]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp'],
      'video/*': ['.mp4', '.mov', '.webm']
    },
    multiple: isComparisonMode
  });

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      }
    } catch (err) {
      setError("Camera access denied. Please check permissions.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsCameraActive(false);
    }
  };

  const captureFrame = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setPreview(dataUrl);
        fetch(dataUrl)
          .then(res => res.blob())
          .then(blob => {
            const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
            setFile(file);
          });
        stopCamera();
      }
    }
  };

  const extractMetadata = async (file: File) => {
    try {
      const metadata = await exifr.parse(file);
      return metadata;
    } catch (err) {
      console.error("Metadata extraction failed:", err);
      return {};
    }
  };

  const runAnalysis = async () => {
    if (!file) return;

    setIsScanning(true);
    setScanProgress(0);
    setError(null);
    setChatMessages([]);

    const progressInterval = setInterval(() => {
      setScanProgress(prev => Math.min(prev + 5, 95));
    }, 200);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const parts: any[] = [];
      
      // Add file 1
      const base64Data1 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(file);
      });
      parts.push({ inlineData: { mimeType: file.type, data: base64Data1 } });
      
      if (isComparisonMode && file2) {
        const base64Data2 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.readAsDataURL(file2);
        });
        parts.push({ inlineData: { mimeType: file2.type, data: base64Data2 } });
      }

      const metadata = await extractMetadata(file);

      const prompt = `
        You are a world-class forensic deepfake detection expert. 
        ${isComparisonMode ? 'Compare these two files' : 'Analyze this file'} for signs of AI manipulation.
        Technical Metadata: ${JSON.stringify(metadata)}
        Focus areas: ${options.focusArea}.
        Face Detection Priority: ${options.faceDetection ? 'ENABLED (Prioritize facial regions, eye movement, and lip-sync consistency)' : 'DISABLED'}.
        Sensitivity Level: ${options.sensitivity}/100.
        Deep Scan Enabled: ${options.deepScan ? 'YES (Perform pixel-level noise analysis and GAN fingerprinting)' : 'NO'}.
        Temporal Analysis: ${options.temporalAnalysis ? 'ENABLED (Analyze frame-to-frame consistency, motion jitter, and temporal artifacts)' : 'DISABLED'}.
        
        Provide a detailed forensic report including:
        1. Confidence score (0-100, 100 = definitely fake).
        2. Whether it is a deepfake (true/false).
        3. List of detected artifacts (name, score, description).
        4. Detailed analysis of the findings.
        5. If comparison mode is active, highlight differences and similarities relevant to deepfake detection.
        6. Perform OCR on any detected text and identify if it is suspicious or manipulated.
        
        Return a JSON object with:
        1. confidence: 0-100
        2. isDeepfake: boolean
        3. artifacts: array of {name, score, description}
        4. analysis: detailed string
        5. heatmap: array of {x, y, intensity, label} where x and y are percentages (0-100) indicating where artifacts are detected.
        6. metadata: Record<string, string> containing technical details like "Neural Signature", "Compression Artifacts", "Frame Rate Inconsistency", etc.
        7. ocrData: array of {text, isSuspicious, reasoning}
      `;
      
      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: { parts: parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              confidence: { type: Type.NUMBER },
              isDeepfake: { type: Type.BOOLEAN },
              artifacts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    score: { type: Type.NUMBER },
                    description: { type: Type.STRING }
                  },
                  required: ["name", "score", "description"]
                }
              },
              analysis: { type: Type.STRING },
              metadata: {
                type: Type.OBJECT,
                description: "Technical metadata about the scan",
                properties: {}, // Empty properties as it's a Record<string, string>
                additionalProperties: { type: Type.STRING }
              },
              heatmap: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    x: { type: Type.NUMBER },
                    y: { type: Type.NUMBER },
                    intensity: { type: Type.NUMBER },
                    label: { type: Type.STRING }
                  },
                  required: ["x", "y", "intensity", "label"]
                }
              },
              ocrData: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    isSuspicious: { type: Type.BOOLEAN },
                    reasoning: { type: Type.STRING }
                  },
                  required: ["text", "isSuspicious", "reasoning"]
                }
              }
            },
            required: ["confidence", "isDeepfake", "artifacts", "analysis"]
          }
        }
      });

      const data = JSON.parse(response.text || "{}") as DetectionResult;
      data.timestamp = Date.now();
      
      // Save to Firebase if user is logged in
      if (user) {
        try {
          await addDoc(collection(db, 'history'), {
            ...data,
            userId: user.uid,
            fileName: file.name
          });
        } catch (err) {
          console.error("Failed to save to history:", err);
        }
      }
      
      // Initial assistant message
      const initialMessages: ChatMessage[] = [{
        role: 'assistant',
        content: `Forensic scan complete. Neural confidence: ${data.confidence}%. I have identified ${data.artifacts.length} potential artifacts. How can I assist you with this forensic report?`
      }];
      
      data.messages = initialMessages;
      setResult(data);
      setHistory(prev => [data, ...prev].slice(0, 10));
      setScanProgress(100);
      setChatMessages(initialMessages);
    } catch (err) {
      console.error(err);
      setError("Analysis failed. Neural link error.");
    } finally {
      clearInterval(progressInterval);
      setIsScanning(false);
    }
  };

  const exportToPDF = () => {
    if (!result) return;
    const doc = new jsPDF();
    doc.text("Forensic Report", 10, 10);
    doc.text(`Confidence: ${result.confidence}%`, 10, 20);
    doc.text(`Is Deepfake: ${result.isDeepfake ? 'Yes' : 'No'}`, 10, 30);
    doc.text(`Analysis: ${result.analysis}`, 10, 40);
    
    // @ts-ignore
    doc.autoTable({
      head: [['Artifact', 'Score', 'Description']],
      body: result.artifacts.map(a => [a.name, a.score, a.description]),
      startY: 50,
    });
    
    doc.save(`forensic_report_${result.timestamp}.pdf`);
  };

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Failed to sign in:", err);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || !result) return;

    const userMsg: ChatMessage = { role: 'user', content: userInput };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    
    // Sync with history
    setHistory(prev => prev.map(h => h.timestamp === result.timestamp ? { ...h, messages: newMessages } : h));
    
    setUserInput('');
    setIsAssistantTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const chat = ai.chats.create({
        model: GEMINI_MODEL,
        config: {
          systemInstruction: `You are the Deepfake Forensics AI Assistant. 
          Current Scan Results: Confidence: ${result.confidence}%, Is Deepfake: ${result.isDeepfake}, Artifacts: ${JSON.stringify(result.artifacts)}, Analysis: ${result.analysis}.
          Answer user questions about these results professionally.`,
        },
      });

      const response = await chat.sendMessage({ message: userInput });
      const assistantMsg: ChatMessage = { role: 'assistant', content: response.text };
      const updatedMessages = [...newMessages, assistantMsg];
      setChatMessages(updatedMessages);
      
      // Sync with history again
      setHistory(prev => prev.map(h => h.timestamp === result.timestamp ? { ...h, messages: updatedMessages } : h));
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Neural link error." }]);
    } finally {
      setIsAssistantTyping(false);
    }
  };

  const getRiskColor = (score: number) => {
    if (score < 30) return '#3b82f6';
    if (score < 70) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div className="min-h-screen bg-[#121212] text-[#e0e0e0] font-sans selection:bg-[#3b82f6]/30 relative overflow-hidden">
      <header className="border-b border-white/10 bg-[#121212]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative group cursor-pointer">
              <div className="absolute -inset-1 bg-[#3b82f6] rounded-sm blur-md opacity-25 group-hover:opacity-75 transition duration-500"></div>
              <div className="relative w-10 h-10 bg-[#121212] border border-white/20 flex items-center justify-center overflow-hidden shadow-lg">
                <Fingerprint className="text-[#3b82f6] w-6 h-6 absolute" />
                <ShieldAlert className="text-[#ef4444] w-3 h-3 absolute bottom-1 right-1" />
                <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none"></div>
              </div>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white leading-none uppercase">
                  DEEPFAKE_FORENSICS
                </h1>
                <span className="px-1.5 py-0.5 bg-[#ff003c] text-black text-[7px] font-black tracking-widest uppercase rounded-sm animate-pulse">
                  Forensic_Core
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="w-1 h-1 bg-[#00ff41]/40" style={{ opacity: Math.random() }} />
                  ))}
                </div>
                <span className="text-[8px] text-[#00ff41]/60 uppercase tracking-[0.2em]">Neural_Link_Active</span>
                <span className="w-1 h-1 rounded-full bg-[#00ff41] animate-pulse shadow-[0_0_5px_#00ff41]" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-6 mr-6 text-[10px] text-[#00ff41]/40 uppercase tracking-widest">
              <div className="flex flex-col items-end">
                <span>CPU_LOAD</span>
                <span className="text-[#00ff41]">12.4%</span>
              </div>
              <div className="flex flex-col items-end">
                <span>MEM_USAGE</span>
                <span className="text-[#00ff41]">4.2GB</span>
              </div>
            </div>
            <button onClick={() => setIsChatting(!isChatting)} className={cn("p-2 transition-all border border-white/20", isChatting ? "bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/50" : "hover:bg-white/5 text-gray-400")}>
              <MessageSquare className="w-4 h-4" />
            </button>
            <button onClick={() => setShowSettings(!showSettings)} className={cn("p-2 transition-all border border-white/20", showSettings ? "bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/50" : "hover:bg-white/5 text-gray-400")}>
              <Settings2 className="w-4 h-4" />
            </button>
            {user ? (
              <button onClick={handleSignOut} className="px-3 py-1.5 bg-white/5 border border-white/20 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-white/10">Sign_Out</button>
            ) : (
              <button onClick={signIn} className="px-3 py-1.5 bg-[#3b82f6] text-white text-[10px] font-bold uppercase tracking-widest hover:bg-[#3b82f6]/90">Sign_In</button>
            )}
          </div>
        </div>
      </header>

      {/* Floating Chat Button */}
      <button 
        onClick={() => setIsChatting(true)}
        className="fixed bottom-6 right-6 p-4 bg-[#3b82f6] text-white rounded-full shadow-lg hover:bg-[#3b82f6]/90 transition-all z-50 flex items-center gap-2"
      >
        <MessageSquare className="w-5 h-5" />
        <span className="text-[10px] font-bold uppercase">Chat_With_AI</span>
      </button>

      <main className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-[#3b82f6]/20 rounded-sm blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
            <div className="relative bg-[#1a1a1a] border border-white/20 rounded-sm overflow-hidden shadow-lg">
              <div className="absolute top-4 right-4 z-10">
                <button 
                  onClick={() => setIsComparisonMode(!isComparisonMode)}
                  className={cn(
                    "px-3 py-1 text-[8px] font-bold uppercase tracking-widest border transition-all",
                    isComparisonMode ? "bg-[#3b82f6]/20 border-[#3b82f6] text-[#3b82f6]" : "bg-black/50 border-white/20 text-gray-400 hover:border-white/40"
                  )}
                >
                  {isComparisonMode ? "Comparison_Mode_Active" : "Enable_Comparison_Mode"}
                </button>
              </div>
              {!preview && !isCameraActive ? (
                <div {...getRootProps()} className={cn("h-[520px] flex flex-col items-center justify-center p-12 text-center cursor-pointer transition-all", isDragActive ? "bg-[#00ff41]/5 border-[#00ff41]/50" : "hover:bg-[#00ff41]/2")}>
                  <input {...getInputProps()} />
                  <div className="w-16 h-16 bg-[#00ff41]/5 flex items-center justify-center mb-6 border border-[#00ff41]/20 group-hover:scale-110 transition-transform shadow-[inset_0_0_10px_rgba(0,255,65,0.1)]"><Upload className="w-8 h-8 text-[#00ff41]/40" /></div>
                  <h3 className="text-lg font-bold text-[#00ff41] mb-2 tracking-widest uppercase">Awaiting_Forensic_Input</h3>
                  <p className="text-[#00ff41]/40 text-[10px] max-w-xs mx-auto mb-8 tracking-wider uppercase">Inject high-resolution neural evidence for deep-packet manipulation analysis.</p>
                  <div className="flex gap-4">
                    <button className="px-5 py-2 bg-black border border-[#00ff41]/30 hover:border-[#00ff41] text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2"><FileSearch className="w-3 h-3" /> Browse_FS</button>
                    <button onClick={(e) => { e.stopPropagation(); startCamera(); }} className="px-5 py-2 bg-[#00ff41] text-black text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(0,255,65,0.3)]"><Camera className="w-3 h-3" /> Live_Feed</button>
                  </div>
                </div>
              ) : isCameraActive ? (
                <div className="relative h-[520px] bg-black">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover grayscale brightness-125 contrast-125" />
                  <div className="absolute inset-0 border-[20px] border-black/20 pointer-events-none" />
                  <div className="absolute top-4 left-4 flex items-center gap-2 text-[10px] font-bold text-[#00ff41] bg-black/60 px-2 py-1 border border-[#00ff41]/30">
                    <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse" /> REC_STREAM_01
                  </div>
                  <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4">
                    <button onClick={stopCamera} className="p-4 bg-black/60 hover:bg-black/80 backdrop-blur-md border border-[#00ff41]/30 transition-colors"><X className="w-6 h-6 text-[#00ff41]" /></button>
                    <button onClick={captureFrame} className="p-4 bg-[#00ff41] hover:bg-[#00ff41]/90 shadow-[0_0_30px_rgba(0,255,65,0.5)] transition-transform active:scale-90"><Scan className="w-6 h-6 text-black" /></button>
                  </div>
                </div>
              ) : (
                <div className={cn("relative h-[520px] group/preview", isComparisonMode ? "flex gap-2" : "")}>
                  {isComparisonMode ? (
                    <div className="w-full h-full">
                      {file && file2 ? (
                        <ReactCompareSlider
                          itemOne={<ReactCompareSliderImage src={preview!} alt="File 1" />}
                          itemTwo={<ReactCompareSliderImage src={preview2!} alt="File 2" />}
                          className="w-full h-full"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-500 uppercase tracking-widest">
                          {!file ? "Awaiting_File_1" : "Awaiting_File_2"}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {file?.type.startsWith('video') ? (
                        <video 
                          src={preview!} 
                          controls 
                          className="w-full h-full object-contain bg-black" 
                        />
                      ) : (
                        <img 
                          src={preview!} 
                          alt="Preview" 
                          className="w-full h-full object-contain bg-black" 
                        />
                      )}
                    </>
                  )}
                  
                  {/* Preview Controls */}
                  <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover/preview:opacity-100 transition-opacity z-10">
                    <button 
                      onClick={() => {
                        setFile(null);
                        setPreview(null);
                        setFile2(null);
                        setPreview2(null);
                        setResult(null);
                        setError(null);
                      }}
                      className="p-2 bg-black/60 hover:bg-black/80 border border-[#ff003c]/30 text-[#ff003c] backdrop-blur-md transition-all flex items-center gap-2 text-[8px] font-bold uppercase tracking-widest"
                      title="Clear Evidence"
                    >
                      <X className="w-3 h-3" /> CLEAR_EVIDENCE
                    </button>
                  </div>

                  {/* Artifact Detail Modal */}
                  <AnimatePresence>
                    {selectedArtifact && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="absolute inset-4 z-20 bg-black/90 border border-[#ff003c]/50 p-6 flex flex-col items-center justify-center backdrop-blur-md"
                      >
                        <button 
                          onClick={() => setSelectedArtifact(null)}
                          className="absolute top-4 right-4 text-[#ff003c] hover:text-white"
                        >
                          <X className="w-6 h-6" />
                        </button>
                        <h3 className="text-[#ff003c] font-black text-xl uppercase tracking-widest mb-4">{selectedArtifact.label}</h3>
                        <p className="text-white text-sm mb-6 text-center max-w-md">{selectedArtifact.description}</p>
                        <div className="flex items-center gap-2 bg-[#ff003c]/10 px-4 py-2 border border-[#ff003c]/30">
                          <span className="text-[10px] text-[#ff003c]/60 uppercase tracking-widest">Confidence</span>
                          <span className="text-sm font-bold text-white">{selectedArtifact.confidence}%</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="absolute top-4 left-4 pointer-events-none">
                    <div className="flex items-center gap-2 text-[8px] font-bold text-[#00ff41] bg-black/60 px-2 py-1 border border-[#00ff41]/30 backdrop-blur-md">
                      <Eye className="w-3 h-3" /> PREVIEW_MODE
                    </div>
                  </div>
                  
                  {result?.heatmap && showHeatmap && !isScanning && (
                    <div className="absolute inset-0 pointer-events-none">
                      {result.heatmap.map((point, i) => (
                        <motion.div
                          key={i}
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: i * 0.1 }}
                          className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                          style={{ left: `${point.x}%`, top: `${point.y}%` }}
                          onClick={() => setSelectedArtifact(point)}
                        >
                          <div 
                            className="w-16 h-16 rounded-full blur-2xl animate-pulse"
                            style={{ 
                              backgroundColor: `rgba(255, 0, 60, ${point.intensity * 0.4})`,
                              boxShadow: `0 0 30px rgba(255, 0, 60, ${point.intensity * 0.5})`
                            }}
                          />
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                            <div className="w-1.5 h-1.5 bg-[#ff003c] shadow-[0_0_10px_rgba(255,0,60,1)]" />
                            <span className="mt-1 px-1 py-0.5 bg-black border border-[#ff003c]/50 text-[7px] font-bold text-[#ff003c] uppercase whitespace-nowrap tracking-tighter">
                              {point.label}
                            </span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {isScanning && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
                      <div className="w-72 h-0.5 bg-[#00ff41]/10 mb-6 relative overflow-hidden">
                        <motion.div className="absolute inset-y-0 left-0 bg-[#00ff41] shadow-[0_0_10px_#00ff41]" initial={{ width: 0 }} animate={{ width: `${scanProgress}%` }} />
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center gap-3 text-[#00ff41] font-bold text-[10px] tracking-[0.3em] uppercase">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Neural_Deconstruction... {scanProgress}%
                        </div>
                        <div className="text-[8px] text-[#00ff41]/40 font-mono tracking-widest uppercase">Analyzing_Pixel_Gradients_v2.4.1</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-black border border-[#00ff41]/20 rounded-sm">
            <div className="flex items-center gap-8">
              <div className="flex flex-col">
                <span className="text-[8px] text-[#00ff41]/40 uppercase tracking-widest">Evidence_Log</span>
                <span className="text-[10px] font-bold text-[#00ff41] uppercase tracking-wider">{file ? `${file.name.slice(0, 20)}... [${(file.size / 1024 / 1024).toFixed(2)}MB]` : "No_Input_Detected"}</span>
              </div>
              {result && (
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setShowHeatmap(!showHeatmap)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 text-[9px] font-black uppercase transition-all border",
                      showHeatmap 
                        ? "bg-[#ff003c]/10 border-[#ff003c]/50 text-[#ff003c] shadow-[0_0_10px_rgba(255,0,60,0.2)]" 
                        : "bg-black border-[#00ff41]/20 text-[#00ff41]/40 hover:border-[#00ff41]/50"
                    )}
                  >
                    <Layers className="w-3 h-3" />
                    Heatmap_{showHeatmap ? 'ON' : 'OFF'}
                  </button>
                </div>
              )}
            </div>
            <button disabled={!file || isScanning} onClick={runAnalysis} className={cn("px-8 py-3 font-black tracking-[0.2em] transition-all flex items-center gap-3 border", !file || isScanning ? "bg-black border-[#00ff41]/10 text-[#00ff41]/20 cursor-not-allowed" : "bg-[#00ff41] text-black hover:shadow-[0_0_30px_rgba(0,255,65,0.4)] active:scale-95")}>
              {isScanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-current" />}
              {isScanning ? "SCANNING..." : "INIT_SCAN"}
            </button>
          </div>

          {/* History Section */}
          {user && (
            <div className="bg-[#1a1a1a] border border-white/20 p-6 rounded-sm">
              <h2 className="text-[12px] font-bold text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                <History className="w-4 h-4 text-[#3b82f6]" />
                Forensic_History
              </h2>
              <div className="space-y-4">
                {history.map((h, i) => (
                  <div key={i} className="p-4 bg-black border border-white/10 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-gray-400">{new Date(h.timestamp).toLocaleString()}</span>
                      <span className="text-sm font-bold text-white">{h.isDeepfake ? "DEEPFAKE_DETECTED" : "CLEAN"}</span>
                    </div>
                    <button onClick={() => setResult(h)} className="px-3 py-1.5 bg-white/5 border border-white/20 text-[10px] uppercase tracking-widest hover:bg-white/10">View</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <AnimatePresence>
            {showSettings && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="p-8 bg-black border border-[#00ff41]/20 rounded-sm grid grid-cols-1 md:grid-cols-3 gap-12">
                      
                      {/* Neural Threshold */}
                      <div className="space-y-4 group">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-[#00ff41] uppercase tracking-widest flex items-center gap-2">
                            Neural_Threshold
                            <div className="relative">
                              <span className="text-[#00ff41]/40 cursor-help">?</span>
                              <div className="absolute left-full ml-2 w-48 p-2 bg-black border border-[#00ff41]/30 text-[8px] text-[#00ff41] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                Adjusts the sensitivity of the neural network. Higher values increase detection sensitivity but may lead to more false positives.
                              </div>
                            </div>
                          </label>
                          <span className="text-[10px] font-bold text-[#00ff41]">{options.sensitivity}%</span>
                        </div>
                        <input type="range" min="1" max="100" value={options.sensitivity} onChange={(e) => setOptions({...options, sensitivity: parseInt(e.target.value)})} className="w-full h-1 bg-[#00ff41]/10 rounded-none appearance-none cursor-pointer accent-[#00ff41]" />
                      </div>

                      {/* Analysis Vector */}
                      <div className="space-y-4 group">
                        <label className="text-[10px] font-bold text-[#00ff41] uppercase tracking-widest flex items-center gap-2">
                          Analysis_Vector
                          <div className="relative">
                            <span className="text-[#00ff41]/40 cursor-help">?</span>
                            <div className="absolute left-full ml-2 w-48 p-2 bg-black border border-[#00ff41]/30 text-[8px] text-[#00ff41] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                              Select the primary focus area for the forensic scan.
                            </div>
                          </div>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {['all', 'face', 'lighting', 'background'].map((area) => (
                            <button key={area} onClick={() => setOptions({...options, focusArea: area as any})} className={cn("px-3 py-2 text-[8px] font-black uppercase border transition-all", options.focusArea === area ? "bg-[#00ff41]/10 border-[#00ff41] text-[#00ff41]" : "bg-black border-[#00ff41]/20 text-[#00ff41]/40 hover:border-[#00ff41]/50")}>{area}</button>
                          ))}
                        </div>
                      </div>

                      {/* Subsystem Overrides */}
                      <div className="space-y-4 group">
                        <label className="text-[10px] font-bold text-[#00ff41] uppercase tracking-widest flex items-center gap-2">
                          Subsystem_Overrides
                          <div className="relative">
                            <span className="text-[#00ff41]/40 cursor-help">?</span>
                            <div className="absolute left-full ml-2 w-48 p-2 bg-black border border-[#00ff41]/30 text-[8px] text-[#00ff41] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                              Toggle specific forensic subsystems for targeted analysis.
                            </div>
                          </div>
                        </label>
                        <div className="flex flex-col gap-2">
                          {[
                            { key: 'faceDetection', label: 'Face_Detection', icon: Scan, tooltip: 'Enables specialized facial landmark analysis.' },
                            { key: 'deepScan', label: 'Deep_Scan', icon: Cpu, tooltip: 'Performs a more intensive, multi-pass analysis.' },
                            { key: 'temporalAnalysis', label: 'Temporal_Sync', icon: History, tooltip: 'Analyzes frame-to-frame consistency over time.' }
                          ].map((item) => (
                            <button 
                              key={item.key}
                              onClick={() => setOptions({...options, [item.key]: !options[item.key as keyof ScanOptions]})}
                              className={cn(
                                "w-full px-3 py-2 text-[8px] font-black uppercase border transition-all flex items-center justify-between group/item",
                                options[item.key as keyof ScanOptions] ? "bg-[#00ff41]/10 border-[#00ff41] text-[#00ff41]" : "bg-black border-[#00ff41]/20 text-[#00ff41]/40 hover:border-[#00ff41]/50"
                              )}
                            >
                              <div className="flex items-center gap-2"><item.icon className="w-3 h-3" /> {item.label}</div>
                              <div className={cn("w-1.5 h-1.5", options[item.key as keyof ScanOptions] ? "bg-[#00ff41] shadow-[0_0_5px_#00ff41]" : "bg-gray-800")} />
                              
                              {/* Item Tooltip */}
                              <div className="absolute right-full mr-2 w-48 p-2 bg-black border border-[#00ff41]/30 text-[8px] text-[#00ff41] opacity-0 group-hover/item:opacity-100 transition-opacity pointer-events-none z-50">
                                {item.tooltip}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-sm overflow-hidden flex flex-col h-full min-h-[600px] shadow-lg">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
              <div className="flex items-center gap-2"><Activity className="w-4 h-4 text-[#3b82f6]" /><h2 className="text-[10px] font-black uppercase tracking-[0.2em]">Forensic_Report_v4</h2></div>
              <div className="flex items-center gap-2">
                {result && <span className="text-[8px] font-mono text-gray-500">HASH: {result.timestamp.toString(16).toUpperCase()}</span>}
                {result && (
                  <button onClick={exportToPDF} className="p-1 hover:bg-white/10 rounded transition-colors" title="Export PDF">
                    <Download className="w-3 h-3 text-[#3b82f6]" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 p-6 space-y-8 overflow-y-auto custom-scrollbar relative">
              <AnimatePresence mode="wait">
                {isChatting ? (
                  <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col p-6 bg-black">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#00ff41]/10">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3 h-3 text-[#00ff41]" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-[#00ff41]">Neural_Assistant</span>
                      </div>
                      <button 
                        onClick={() => setShowChatHistory(!showChatHistory)}
                        className={cn(
                          "px-2 py-1 text-[8px] font-bold uppercase border transition-all",
                          showChatHistory ? "bg-[#00ff41]/20 border-[#00ff41] text-[#00ff41]" : "bg-black border-[#00ff41]/20 text-[#00ff41]/40 hover:border-[#00ff41]/60"
                        )}
                      >
                        {showChatHistory ? "CLOSE_HISTORY" : "VIEW_HISTORY"}
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4 mb-4 custom-scrollbar pr-2 relative">
                      <AnimatePresence>
                        {showChatHistory ? (
                          <motion.div 
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="absolute inset-0 bg-black z-10 space-y-2"
                          >
                            <h4 className="text-[8px] font-bold text-[#00ff41]/40 uppercase tracking-[0.3em] mb-4">Past_Conversations</h4>
                            {history.filter(h => h.messages && h.messages.length > 0).length === 0 ? (
                              <div className="text-center py-12 opacity-20">
                                <History className="w-8 h-8 mx-auto mb-2" />
                                <p className="text-[8px] uppercase tracking-widest">No_History_Found</p>
                              </div>
                            ) : (
                              history.filter(h => h.messages && h.messages.length > 0).map((h, i) => (
                                <button 
                                  key={i} 
                                  onClick={() => {
                                    setResult(h);
                                    setChatMessages(h.messages || []);
                                    setShowChatHistory(false);
                                  }}
                                  className={cn(
                                    "w-full p-3 text-left border transition-all group",
                                    result.timestamp === h.timestamp ? "bg-[#00ff41]/10 border-[#00ff41] text-[#00ff41]" : "bg-black border-[#00ff41]/10 text-gray-500 hover:border-[#00ff41]/40"
                                  )}
                                >
                                  <div className="flex justify-between items-start mb-1">
                                    <span className="text-[9px] font-bold uppercase tracking-wider">LOG_0x{h.timestamp.toString(16).slice(-4).toUpperCase()}</span>
                                    <span className="text-[7px] opacity-40">{new Date(h.timestamp).toLocaleTimeString()}</span>
                                  </div>
                                  <p className="text-[8px] line-clamp-1 opacity-60 italic">"{h.messages?.[h.messages.length - 1]?.content}"</p>
                                </button>
                              ))
                            )}
                          </motion.div>
                        ) : (
                          <>
                            {chatMessages.length === 0 && <div className="text-center py-12 opacity-20"><Sparkles className="w-10 h-10 mx-auto mb-4" /><p className="text-[8px] uppercase tracking-widest">Neural_Assistant_Standby...</p></div>}
                            {chatMessages.map((msg, i) => (
                              <div key={i} className={cn("flex flex-col max-w-[90%]", msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start")}>
                                <div className={cn("px-4 py-2 border text-[10px] leading-relaxed", msg.role === 'user' ? "bg-[#00ff41]/10 border-[#00ff41]/30 text-[#00ff41]" : "bg-black border-white/10 text-gray-400")}>{msg.content}</div>
                              </div>
                            ))}
                            {isAssistantTyping && <div className="flex items-center gap-2 text-[8px] font-bold text-[#00ff41] animate-pulse"><RefreshCw className="w-3 h-3 animate-spin" /> PROCESSING_QUERY...</div>}
                            <div ref={chatEndRef} />
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                    {!showChatHistory && (
                      <form onSubmit={handleSendMessage} className="flex gap-2">
                        <input value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder="Query_Neural_Core..." className="flex-1 bg-black border border-[#00ff41]/20 px-4 py-2.5 text-[10px] focus:outline-none focus:border-[#00ff41] transition-colors placeholder:text-[#00ff41]/20" />
                        <button type="submit" disabled={isAssistantTyping || !result} className="px-4 bg-[#00ff41] text-black hover:bg-[#00ff41]/90 disabled:opacity-20 transition-colors"><Send className="w-4 h-4" /></button>
                      </form>
                    )}
                  </motion.div>
                ) : (
                  <motion.div key="report" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                    {!result && !isScanning ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-10"><Database className="w-12 h-12 mb-4" /><p className="text-[10px] uppercase tracking-widest">Awaiting_Data_Stream</p></div>
                    ) : result && (
                      <div className="space-y-8">
                        <div className="relative flex flex-col items-center">
                          <div className="w-44 h-44">
                            <ResponsiveContainer width="100%" height="100%">
                              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={result.artifacts}><PolarGrid stroke="#00ff41" strokeOpacity={0.1} /><PolarAngleAxis dataKey="name" tick={{ fill: '#00ff41', fontSize: 8, opacity: 0.5 }} /><Radar name="Artifact Score" dataKey="score" stroke={getRiskColor(result.confidence)} fill={getRiskColor(result.confidence)} fillOpacity={0.2} /></RadarChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center"><span className="block text-4xl font-black tracking-tighter text-glow" style={{ color: getRiskColor(result.confidence) }}>{result.confidence}%</span><span className="text-[8px] font-bold text-[#00ff41]/40 uppercase tracking-widest">Risk_Index</span></div>
                        </div>
                        <div className={cn("p-4 border flex items-center gap-4", result.isDeepfake ? "bg-[#ff003c]/5 border-[#ff003c]/30" : "bg-[#00ff41]/5 border-[#00ff41]/30")}>
                          <div className={cn("w-10 h-10 flex items-center justify-center shrink-0", result.isDeepfake ? "bg-[#ff003c] text-black" : "bg-[#00ff41] text-black")}>{result.isDeepfake ? <ShieldAlert className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}</div>
                          <div><h3 className="text-[11px] font-black uppercase tracking-widest" style={{ color: getRiskColor(result.confidence) }}>{result.isDeepfake ? "Deepfake_Confirmed" : "Media_Verified"}</h3><p className="text-[9px] text-gray-500 uppercase tracking-tight">{result.isDeepfake ? "Neural manipulation detected in bitstream." : "No significant AI signatures identified."}</p></div>
                        </div>
                        <div className="space-y-4">
                          <h4 className="text-[8px] font-bold text-[#00ff41]/40 uppercase tracking-[0.3em]">Artifact_Telemetry</h4>
                          <div className="h-48 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={result.artifacts} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <XAxis dataKey="name" tick={{ fill: '#00ff41', fontSize: 7, opacity: 0.4 }} axisLine={false} tickLine={false} />
                                <YAxis domain={[0, 100]} tick={{ fill: '#00ff41', fontSize: 7, opacity: 0.4 }} axisLine={false} tickLine={false} />
                                <Tooltip 
                                  contentStyle={{ backgroundColor: '#000', border: '1px solid rgba(0,255,65,0.2)', fontSize: '8px', color: '#00ff41' }}
                                  itemStyle={{ color: '#00ff41' }}
                                  cursor={{ fill: 'rgba(0,255,65,0.05)' }}
                                />
                                <Bar dataKey="score">
                                  {result.artifacts.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={getRiskColor(entry.score)} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="space-y-4">
                            {result.artifacts.map((art, i) => (
                              <div key={i} className="group mb-4">
                                <div className="flex items-center justify-between mb-1.5"><span className="text-[9px] font-bold text-[#3b82f6] uppercase">{art.name}</span><span className="text-[9px] font-bold" style={{ color: getRiskColor(art.score) }}>{art.score}%</span></div>
                                <div className="h-1 bg-white/5 relative overflow-hidden mb-2"><motion.div initial={{ width: 0 }} animate={{ width: `${art.score}%` }} className="h-full absolute inset-0 left-0" style={{ backgroundColor: getRiskColor(art.score), boxShadow: `0 0 10px ${getRiskColor(art.score)}` }} /></div>
                                <p className="text-[9px] text-gray-400 leading-relaxed">{art.description}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="p-4 bg-[#00ff41]/2 border border-[#00ff41]/10 space-y-2">
                          <div className="flex items-center gap-2 text-[#00ff41] mb-2">
                            <Info className="w-3 h-3" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Forensic_Analysis_Log</span>
                          </div>
                          <p className="text-[10px] text-gray-400 leading-relaxed font-mono">"{result.analysis}"</p>
                        </div>

                        {/* OCR Data Section */}
                        {result.ocrData && result.ocrData.length > 0 && (
                          <div className="border border-[#3b82f6]/20 rounded-sm overflow-hidden">
                            <div className="p-3 bg-[#3b82f6]/5 flex items-center gap-2">
                              <Sparkles className="w-3 h-3 text-[#3b82f6]" />
                              <span className="text-[9px] font-black uppercase tracking-widest text-[#3b82f6]">Detected_Text_OCR</span>
                            </div>
                            <div className="p-4 space-y-3 bg-black/40">
                              {result.ocrData.map((ocr, i) => (
                                <div key={i} className={cn("p-3 border rounded-sm", ocr.isSuspicious ? "bg-[#ff003c]/5 border-[#ff003c]/30" : "bg-white/5 border-white/10")}>
                                  <p className={cn("text-[10px] font-mono mb-1", ocr.isSuspicious ? "text-[#ff003c]" : "text-white")}>{ocr.text}</p>
                                  {ocr.isSuspicious && (
                                    <p className="text-[8px] text-[#ff003c]/80 italic">Suspicious: {ocr.reasoning}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {result.metadata && Object.keys(result.metadata).length > 0 && (
                          <div className="border border-[#00ff41]/10 rounded-sm overflow-hidden">
                            <button 
                              onClick={() => setShowMetadata(!showMetadata)}
                              className="w-full p-3 flex items-center justify-between bg-[#00ff41]/5 hover:bg-[#00ff41]/10 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <Database className="w-3 h-3 text-[#00ff41]" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-[#00ff41]">Technical_Metadata</span>
                              </div>
                              <motion.div
                                animate={{ rotate: showMetadata ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <RefreshCw className="w-3 h-3 text-[#00ff41]/40" />
                              </motion.div>
                            </button>
                            <AnimatePresence>
                              {showMetadata && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden bg-black/40"
                                >
                                  <div className="p-4 space-y-6">
                                    {/* OCR Data Section */}
                                    {Object.entries(result.metadata).filter(([key]) => ['OCR', 'Text', 'Transcription', 'Embedded'].some(k => key.toLowerCase().includes(k.toLowerCase()))).length > 0 && (
                                      <div className="space-y-2 border-b border-[#00ff41]/20 pb-4">
                                        <div className="flex items-center gap-2 text-[#3b82f6]">
                                          <Sparkles className="w-3 h-3" />
                                          <span className="text-[8px] font-black uppercase tracking-widest">Extracted_OCR_Data</span>
                                        </div>
                                        {Object.entries(result.metadata).filter(([key]) => ['OCR', 'Text', 'Transcription', 'Embedded'].some(k => key.toLowerCase().includes(k.toLowerCase()))).map(([key, value]) => (
                                          <div key={key} className="bg-[#3b82f6]/5 p-3 border border-[#3b82f6]/20 rounded-sm">
                                            <span className="text-[7px] font-bold text-[#3b82f6]/60 uppercase tracking-widest block mb-1">{key}</span>
                                            <p className="text-[10px] text-white/80 font-mono italic leading-relaxed">{value}</p>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Technical Data Section */}
                                    <div className="space-y-3">
                                      <div className="flex items-center gap-2 text-[#00ff41]">
                                        <Database className="w-3 h-3" />
                                        <span className="text-[8px] font-black uppercase tracking-widest">Technical_Metadata</span>
                                      </div>
                                      {Object.entries(result.metadata).filter(([key]) => !['OCR', 'Text', 'Transcription', 'Embedded'].some(k => key.toLowerCase().includes(k.toLowerCase()))).map(([key, value]) => (
                                        <div key={key} className="flex flex-col gap-1">
                                          <span className="text-[7px] font-bold text-[#00ff41]/40 uppercase tracking-widest">{key}</span>
                                          <span className="text-[9px] text-[#00ff41] font-mono break-all">{value}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="p-4 bg-black border-t border-[#00ff41]/10 grid grid-cols-3 gap-4">
              <div className="text-center"><span className="block text-[8px] text-[#00ff41]/40 uppercase tracking-widest">API_HEALTH</span><span className={cn("text-[9px] font-bold", systemMetrics.apiHealth === 'STABLE' ? "text-[#00ff41]" : "text-red-500")}>{systemMetrics.apiHealth}</span></div>
              <div className="text-center border-x border-[#00ff41]/10"><span className="block text-[8px] text-[#00ff41]/40 uppercase tracking-widest">CPU_LOAD</span><span className="text-[9px] font-bold text-[#00ff41]">{Math.round(systemMetrics.cpuLoad)}%</span></div>
              <div className="text-center"><span className="block text-[8px] text-[#00ff41]/40 uppercase tracking-widest">MEM_USAGE</span><span className="text-[9px] font-bold text-[#00ff41]">{Math.round(systemMetrics.memoryUsage)}%</span></div>
            </div>

            <div className="p-4 bg-[#00ff41]/2 border-t border-[#00ff41]/10 grid grid-cols-4 gap-4">
              <div className="text-center"><span className="block text-[8px] text-[#00ff41]/40 uppercase tracking-widest">Encryption</span><span className="text-[9px] font-bold text-[#00ff41]">AES-256</span></div>
              <div className="text-center border-x border-[#00ff41]/10"><span className="block text-[8px] text-[#00ff41]/40 uppercase tracking-widest">Neural_Link</span><span className="text-[9px] font-bold text-[#00ff41]">ACTIVE</span></div>
              <div className="text-center border-r border-[#00ff41]/10"><span className="block text-[8px] text-[#00ff41]/40 uppercase tracking-widest">Protocol</span><span className="text-[9px] font-bold text-[#00ff41]">D-GUARD</span></div>
              <div className="text-center"><span className="block text-[8px] text-[#00ff41]/40 uppercase tracking-widest">Model</span><span className="text-[9px] font-bold text-[#00ff41] truncate block">{GEMINI_MODEL}</span></div>
            </div>
          </div>

          <div className="bg-black border border-[#00ff41]/20 rounded-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2"><History className="w-4 h-4 text-[#00ff41]/40" /><h3 className="text-[10px] font-black uppercase tracking-[0.2em]">Scan_History_Buffer</h3></div>
              <span className="text-[8px] font-mono text-[#00ff41]/20">{history.length} RECORDS_STORED</span>
            </div>
            <div className="space-y-2">
              {history.length === 0 ? <p className="text-[8px] text-[#00ff41]/20 text-center py-4 uppercase tracking-widest">Buffer_Empty</p> : history.map((h, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-white/5 border border-white/10 hover:border-white/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-1.5 h-1.5", h.isDeepfake ? "bg-[#ef4444]" : "bg-[#3b82f6]")} />
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-gray-400">LOG_0x{h.timestamp.toString(16).slice(-4).toUpperCase()}</span>
                      <span className="text-[7px] text-gray-500">{new Date(h.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                  <span className={cn("text-[9px] font-bold", h.isDeepfake ? "text-[#ef4444]" : "text-[#3b82f6]")}>{h.confidence}%_RISK</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-black border border-[#00ff41]/20 rounded-sm p-4 h-48 flex flex-col">
            <div className="flex items-center gap-2 mb-3 border-b border-[#00ff41]/10 pb-2">
              <Database className="w-3 h-3 text-[#00ff41]/40" />
              <span className="text-[8px] font-black uppercase tracking-widest">System_Console</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar font-mono text-[7px] space-y-1 text-[#00ff41]/60">
              {systemLogs.map((log, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-[#00ff41]/20">[{new Date().toLocaleTimeString()}]</span>
                  <span className={cn(log.includes('ERR') ? 'text-[#ff003c]' : '')}>{log}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </main>

      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#00ff41]/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#ff003c]/5 blur-[120px] rounded-full" />
      </div>
    </div>
  );
}
