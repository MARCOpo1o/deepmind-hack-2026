
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { analyzeVideo } from './services/geminiService.ts';
import { Highlight, AnalysisStatus, AnalysisResult, HistoryItem, GalleryItem } from './types.ts';
import { getGallery, saveToGallery, removeFromGallery } from './services/db.ts';
import Timeline from './components/Timeline.tsx';
import HighlightCard from './components/HighlightCard.tsx';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const CACHE_KEY = 'scorevision_history_v1';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'analysis' | 'gallery'>('analysis');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [clippingProgress, setClippingProgress] = useState(0);
  const [targetJersey, setTargetJersey] = useState<string>('');
  const [hasKey, setHasKey] = useState(false);
  const [clippingSupported, setClippingSupported] = useState<boolean | null>(null);

  const videoRef = useRef<any>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  useEffect(() => {
    const savedHistory = localStorage.getItem(CACHE_KEY);
    if (savedHistory) {
      try { setHistory(JSON.parse(savedHistory)); } catch (e) { console.error(e); }
    }

    const loadGalleryItems = async () => {
      try {
        const items = await getGallery();
        const itemsWithUrls = items.map(item => ({
          ...item,
          clipUrl: item.clipBlob ? URL.createObjectURL(item.clipBlob) : undefined
        }));
        setGallery(itemsWithUrls);
      } catch (e) { console.error("Gallery Load Error:", e); }
    };
    loadGalleryItems();

    const checkKey = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        try {
          const selected = await (window as any).aistudio.hasSelectedApiKey();
          setHasKey(selected);
        } catch (e) { setHasKey(false); }
      } else { setHasKey(true); }
    };
    checkKey();
  }, []);

  useEffect(() => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(history));
  }, [history]);

  const getFileId = (file: File) => `${file.name}-${file.size}-${file.lastModified}`;

  const filteredHighlights = useMemo(() => {
    if (!results) return [];
    if (!targetJersey.trim()) return results.highlights;
    return results.highlights.filter(h => h.playerJerseyNumber?.toLowerCase().includes(targetJersey.trim().toLowerCase()));
  }, [results, targetJersey]);

  const filteredGallery = useMemo(() => {
    if (!targetJersey.trim()) return gallery;
    return gallery.filter(h => h.playerJerseyNumber?.toLowerCase().includes(targetJersey.trim().toLowerCase()));
  }, [gallery, targetJersey]);

  const loadFFmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    
    const ffmpeg = new FFmpeg();
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    
    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
      });
      ffmpegRef.current = ffmpeg;
      setClippingSupported(true);
      return ffmpeg;
    } catch (err) {
      console.warn("[ScoreVision] Video engine disabled: Browser security restricts SharedArrayBuffer.");
      setClippingSupported(false);
      return null;
    }
  };

  const generateClips = async (analysis: AnalysisResult, file: File) => {
    if (!analysis.highlights.length) return analysis;
    
    const ffmpeg = await loadFFmpeg();
    if (!ffmpeg) return analysis; // Silently skip clipping if engine is blocked

    setStatus(AnalysisStatus.CLIPPING);
    setClippingProgress(0);

    const isAudioOnly = file.type.startsWith('audio/') || file.name.endsWith('.mp3');
    const extension = file.name.split('.').pop() || 'mp4';
    const inputFileName = `input.${extension}`;

    try {
      await ffmpeg.writeFile(inputFileName, await fetchFile(file));
      const updatedHighlights = [...analysis.highlights];
      
      for (let i = 0; i < updatedHighlights.length; i++) {
        const h = updatedHighlights[i];
        const start = Math.max(0, h.timestampSeconds - 5);
        const clipDuration = 10;
        const outputName = `clip_${i}.${isAudioOnly ? extension : 'mp4'}`;
        
        try {
          await ffmpeg.exec(['-ss', start.toString(), '-i', inputFileName, '-t', clipDuration.toString(), '-c', 'copy', outputName]);
          const data = await ffmpeg.readFile(outputName);
          const blob = new Blob([data], { type: isAudioOnly ? file.type : 'video/mp4' });
          updatedHighlights[i] = { ...h, clipBlob: blob, clipUrl: URL.createObjectURL(blob) };
        } catch (e) {
          console.warn(`Clip ${i} generation skipped.`);
        }
        setClippingProgress(Math.round(((i + 1) / updatedHighlights.length) * 100));
      }
      return { ...analysis, highlights: updatedHighlights };
    } catch (err) {
      console.warn("FFmpeg runtime error, proceeding with analysis only.");
      return analysis;
    }
  };

  const startAnalysis = async () => {
    if (!videoFile) return;
    setError(null);
    const fileId = getFileId(videoFile);
    const cached = history.find(item => item.id === fileId);
    
    if (cached) {
      const restored = await generateClips(cached.result, videoFile);
      setResults(restored);
      setStatus(AnalysisStatus.COMPLETED);
      return;
    }

    try {
      setStatus(AnalysisStatus.UPLOADING);
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(videoFile);
      });
      const base64 = await base64Promise;
      
      setStatus(AnalysisStatus.ANALYZING);
      let analysis = await analyzeVideo(base64, videoFile.type);
      
      const historyItem: HistoryItem = { 
        id: fileId, 
        fileName: videoFile.name, 
        timestamp: Date.now(), 
        result: analysis 
      };
      setHistory(prev => [historyItem, ...prev.filter(h => h.id !== fileId)].slice(0, 10));
      
      analysis = await generateClips(analysis, videoFile);
      setResults(analysis);
      setStatus(AnalysisStatus.COMPLETED);
    } catch (err: any) {
      setError(err.message || 'Analysis failed.');
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const handleSaveToGallery = async (highlight: Highlight) => {
    if (!videoFile) return;
    const id = `${getFileId(videoFile)}-${highlight.timestampSeconds}`;
    const galleryItem: GalleryItem = { ...highlight, id, sourceFileName: videoFile.name, savedAt: Date.now() };

    try {
      await saveToGallery(galleryItem);
      setGallery(prev => [...prev.filter(i => i.id !== id), { ...galleryItem, clipUrl: highlight.clipUrl }]);
    } catch (e) { setError("Storage full."); }
  };

  const handleRemoveFromGallery = async (id: string) => {
    await removeFromGallery(id);
    setGallery(prev => prev.filter(i => i.id !== id));
  };

  const jumpToHighlight = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, seconds - 2);
      videoRef.current.play();
    }
  };

  const handleLoadedMetadata = () => { if (videoRef.current) setDuration(videoRef.current.duration); };
  const handleTimeUpdate = () => { if (videoRef.current) setCurrentTime(videoRef.current.currentTime); };

  if (!hasKey) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-2xl"><i className="fas fa-key text-white text-2xl"></i></div>
        <h2 className="text-2xl font-bold mb-4">Gemini API Key Required</h2>
        <button onClick={async () => { await (window as any).aistudio.openSelectKey(); setHasKey(true); }} className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold shadow-xl">Select API Key</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-200">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg"><i className="fas fa-eye text-white text-xl"></i></div>
              <h1 className="text-xl font-bold text-white">ScoreVision AI</h1>
            </div>
            <nav className="flex items-center gap-1 bg-slate-800/50 p-1 rounded-lg">
              <button onClick={() => setActiveTab('analysis')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'analysis' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>Analysis</button>
              <button onClick={() => setActiveTab('gallery')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'gallery' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>Gallery</button>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
              {/* Fix: Explicitly cast event handler to access input value safely */}
              <input 
                type="text" 
                placeholder="Jersey #" 
                value={targetJersey} 
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTargetJersey(e.target.value)} 
                className="bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-4 py-1.5 text-sm outline-none w-32 md:w-48" 
              />
            </div>
            {videoFile && <button onClick={() => { setVideoFile(null); setResults(null); setStatus(AnalysisStatus.IDLE); }} className="text-xs text-slate-400 hover:text-white underline">Reset</button>}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 lg:p-8">
        {activeTab === 'analysis' ? (
          !videoFile ? (
            <div className="h-[60vh] flex flex-col items-center justify-center text-center">
              <h2 className="text-4xl font-extrabold text-white mb-4">Smart Match Analysis</h2>
              <p className="text-slate-500 mb-8 max-w-md">Identify scorers, jersey numbers, and key events automatically with Gemini AI.</p>
              <label className="w-full max-w-xl aspect-video rounded-3xl border-2 border-dashed border-slate-700 bg-slate-800/20 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 transition-all">
                <input type="file" accept="video/*,audio/*" onChange={(e: any) => { const file = e.target.files?.[0]; if (file) { setVideoFile(file); setVideoUrl(URL.createObjectURL(file)); setStatus(AnalysisStatus.IDLE); setResults(null); } }} className="hidden" />
                <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-4"><i className="fas fa-upload text-slate-400"></i></div>
                <p className="text-lg font-bold text-white">Click to Upload Match</p>
              </label>
            </div>
          ) : (
            <div className="grid lg:grid-cols-12 gap-8">
              <div className="lg:col-span-8 space-y-6">
                <div className="relative aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
                  {videoUrl && (
                    videoFile.type.startsWith('audio/') ? 
                    <audio ref={videoRef} src={videoUrl} onLoadedMetadata={handleLoadedMetadata} onTimeUpdate={handleTimeUpdate} className="w-full absolute bottom-4 px-8" controls /> : 
                    <video ref={videoRef} src={videoUrl} onLoadedMetadata={handleLoadedMetadata} onTimeUpdate={handleTimeUpdate} className="w-full h-full" controls />
                  )}
                  {status !== AnalysisStatus.IDLE && status !== AnalysisStatus.COMPLETED && status !== AnalysisStatus.ERROR && (
                    <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-8 z-30">
                      <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                      <h3 className="text-xl font-bold">{status === AnalysisStatus.ANALYZING ? 'AI is Watching...' : 'Polishing Highlights...'}</h3>
                      {status === AnalysisStatus.CLIPPING && (
                        <div className="w-full max-w-xs bg-slate-800 h-1.5 rounded-full mt-4 overflow-hidden">
                          <div className="bg-indigo-500 h-full transition-all" style={{ width: `${clippingProgress}%` }}></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {status === AnalysisStatus.COMPLETED && (
                  <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
                    <Timeline duration={duration} currentTime={currentTime} highlights={filteredHighlights} onMarkerClick={jumpToHighlight} />
                  </div>
                )}
                {status === AnalysisStatus.IDLE && (
                   <div className="flex justify-center"><button onClick={startAnalysis} className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold shadow-xl">Analyze Performance</button></div>
                )}
              </div>
              <div className="lg:col-span-4">
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl flex flex-col h-[calc(100vh-12rem)] sticky top-24">
                  <div className="p-5 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="font-bold">Match Log</h3>
                    {clippingSupported === false && <span className="text-[10px] text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">Manual Playback</span>}
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    {status === AnalysisStatus.COMPLETED ? (
                      filteredHighlights.map((h, i) => (
                        <HighlightCard 
                          key={i} highlight={h} 
                          isActive={Math.abs(currentTime - h.timestampSeconds) < 2.0} 
                          isSaved={gallery.some(g => g.id === `${getFileId(videoFile!)}-${h.timestampSeconds}`)}
                          onSave={() => handleSaveToGallery(h)}
                          onRemove={() => handleRemoveFromGallery(`${getFileId(videoFile!)}-${h.timestampSeconds}`)}
                          onClick={() => jumpToHighlight(h.timestampSeconds)} 
                        />
                      ))
                    ) : (
                      <p className="text-center text-slate-600 italic py-12">Start analysis to see events.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="space-y-6">
            <h2 className="text-3xl font-bold">Your Gallery</h2>
            {gallery.length === 0 ? <p className="text-slate-500">No saved highlights.</p> : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredGallery.map((item) => <HighlightCard key={item.id} highlight={item} isActive={false} isSaved={true} onRemove={() => handleRemoveFromGallery(item.id)} onClick={() => {}} sourceInfo={item.sourceFileName} />)}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
