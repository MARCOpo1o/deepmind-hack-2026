
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { analyzeVideo, queryVideo } from './services/geminiService.ts';
import { Highlight, AnalysisStatus, AnalysisResult, HistoryItem } from './types.ts';
import Timeline from './components/Timeline.tsx';
import HighlightCard from './components/HighlightCard.tsx';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const CACHE_KEY = 'scorevision_history_v1';

const App: React.FC = () => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [clippingProgress, setClippingProgress] = useState(0);
  const [targetJersey, setTargetJersey] = useState<string>('');
  
  const [userQuery, setUserQuery] = useState('');
  const [queryResponse, setQueryResponse] = useState<string | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  // Load History on mount
  useEffect(() => {
    // Use window.localStorage to fix 'Cannot find name localStorage' error
    const saved = window.localStorage.getItem(CACHE_KEY);
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }

    const checkKey = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        try {
          const selected = await (window as any).aistudio.hasSelectedApiKey();
          setHasKey(selected);
        } catch (e) {
          setHasKey(false);
        }
      } else {
        setHasKey(true);
      }
    };
    checkKey();
  }, []);

  // Save history when it changes
  useEffect(() => {
    // Use window.localStorage to fix 'Cannot find name localStorage' error
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(history));
  }, [history]);

  const getFileId = (file: File) => `${file.name}-${file.size}-${file.lastModified}`;

  const filteredHighlights = useMemo(() => {
    if (!results) return [];
    if (!targetJersey.trim()) return results.highlights;
    return results.highlights.filter(h => 
      h.playerJerseyNumber?.toLowerCase() === targetJersey.trim().toLowerCase()
    );
  }, [results, targetJersey]);

  const loadFFmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    const ffmpeg = new FFmpeg();
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  };

  const generateClips = async (analysis: AnalysisResult, file: File) => {
    if (!analysis.highlights.length) return analysis;
    setStatus(AnalysisStatus.CLIPPING);
    setClippingProgress(0);
    try {
      console.log("[FFmpeg] Initializing clip engine...");
      const ffmpeg = await loadFFmpeg();
      await ffmpeg.writeFile('input.mp4', await fetchFile(file));
      
      const updatedHighlights = [...analysis.highlights];
      for (let i = 0; i < updatedHighlights.length; i++) {
        const h = updatedHighlights[i];
        // Clip 5 seconds before score and 3 seconds after
        const start = Math.max(0, h.timestampSeconds - 5);
        const clipDuration = 8; 
        const outputName = `clip_${i}.mp4`;
        
        await ffmpeg.exec([
          '-ss', start.toString(), 
          '-i', 'input.mp4', 
          '-t', clipDuration.toString(), 
          '-c:v', 'copy', 
          '-c:a', 'copy', 
          outputName
        ]);
        
        const data = await ffmpeg.readFile(outputName);
        const blob = new Blob([data], { type: 'video/mp4' });
        updatedHighlights[i] = { ...h, clipUrl: URL.createObjectURL(blob) };
        setClippingProgress(Math.round(((i + 1) / updatedHighlights.length) * 100));
      }
      return { ...analysis, highlights: updatedHighlights };
    } catch (err) {
      console.error("[FFmpeg] Clipping failed:", err);
      return analysis;
    }
  };

  const startAnalysis = async () => {
    if (!videoFile) return;
    const fileId = getFileId(videoFile);
    
    // Check Cache first
    const cached = history.find(item => item.id === fileId);
    if (cached) {
      console.log("[Cache] Found existing analysis for this video.");
      setStatus(AnalysisStatus.CLIPPING);
      const restoredWithClips = await generateClips(cached.result, videoFile);
      setResults(restoredWithClips);
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
      
      // Save to history (without Blob URLs since they expire)
      const historyItem: HistoryItem = {
        id: fileId,
        fileName: videoFile.name,
        timestamp: Date.now(),
        result: analysis
      };
      setHistory(prev => [historyItem, ...prev.filter(h => h.id !== fileId)].slice(0, 10));

      // Generate actual clips
      analysis = await generateClips(analysis, videoFile);
      setResults(analysis);
      setStatus(AnalysisStatus.COMPLETED);
    } catch (err: any) {
      setError(err.message || 'Analysis failed.');
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const handleHistoryClick = (item: HistoryItem) => {
    // In a real scenario, we'd need the user to pick the file again to get the data
    // because we can't store large video files in localStorage.
    setError("To view history, please upload the original file again. We will automatically restore the AI analysis.");
  };

  const jumpToHighlight = (seconds: number) => {
    if (videoRef.current) {
      const adjustedTime = Math.max(0, seconds - 2);
      (videoRef.current as any).currentTime = adjustedTime;
      (videoRef.current as any).play();
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const updateTime = () => setCurrentTime((video as any).currentTime);
    const updateDuration = () => setDuration((video as any).duration);
    (video as any).addEventListener('timeupdate', updateTime);
    (video as any).addEventListener('loadedmetadata', updateDuration);
    return () => {
      (video as any).removeEventListener('timeupdate', updateTime);
      (video as any).removeEventListener('loadedmetadata', updateDuration);
    };
  }, [videoUrl]);

  if (!hasKey) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center space-y-8">
        <h2 className="text-3xl font-bold text-white">Gemini API Access Required</h2>
        <button onClick={async () => { await (window as any).aistudio.openSelectKey(); setHasKey(true); }} className="px-10 py-5 bg-indigo-600 rounded-2xl font-bold">Select API Key</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-200">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <i className="fas fa-eye text-white text-xl"></i>
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Clipp3</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="fas fa-tshirt text-slate-500 group-focus-within:text-indigo-400 transition-colors"></i>
              </div>
              <input 
                type="text" 
                placeholder="Target Jersey #" 
                value={targetJersey}
                // Cast e.target to HTMLInputElement to fix property existence error on EventTarget
                onChange={(e) => setTargetJersey((e.target as HTMLInputElement).value)}
                className="bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all w-32 md:w-48"
              />
            </div>
            {videoFile && (
              <button 
                onClick={() => { setVideoFile(null); setResults(null); setStatus(AnalysisStatus.IDLE); setVideoUrl(null); }}
                className="text-sm font-medium text-slate-400 hover:text-white transition-colors bg-slate-800/50 px-4 py-2 rounded-lg"
              >
                New Video
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 lg:p-8">
        {!videoFile ? (
          <div className="space-y-12">
            <div className="h-[40vh] flex flex-col items-center justify-center">
              <div className="w-full max-w-2xl text-center space-y-8">
                <h2 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-white">Match Analysis <span className="text-indigo-500">Simplified.</span></h2>
                <label className="group relative block w-full aspect-video md:aspect-[21/9] rounded-3xl border-2 border-dashed border-slate-700 bg-slate-800/20 hover:bg-slate-800/40 hover:border-indigo-500 transition-all cursor-pointer shadow-inner">
                  <input type="file" accept="video/*" onChange={(e: any) => { const file = e.target.files?.[0]; if (file) { setVideoFile(file); setVideoUrl(URL.createObjectURL(file)); } }} className="hidden" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                    <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:bg-indigo-600 transition-all shadow-xl"><i className="fas fa-clapperboard text-2xl text-slate-400 group-hover:text-white"></i></div>
                    <p className="text-xl font-semibold text-white">Upload Sports Video</p>
                  </div>
                </label>
              </div>
            </div>

            {history.length > 0 && (
              <div className="max-w-4xl mx-auto">
                <h3 className="text-lg font-bold text-slate-400 mb-4 flex items-center gap-2">
                  <i className="fas fa-history"></i> Recent Analyses
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {history.map((item) => (
                    <div 
                      key={item.id}
                      onClick={() => handleHistoryClick(item)}
                      className="p-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-indigo-500 transition-all cursor-pointer flex justify-between items-center group"
                    >
                      <div>
                        <p className="font-semibold text-slate-200 group-hover:text-indigo-400 transition-colors">{item.fileName}</p>
                        <p className="text-xs text-slate-500">{new Date(item.timestamp).toLocaleDateString()} • {item.result.highlights.length} Highlights</p>
                      </div>
                      <i className="fas fa-chevron-right text-slate-700 group-hover:text-indigo-500"></i>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-6">
              <div className="relative aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-800 ring-1 ring-slate-700">
                {videoUrl && <video ref={videoRef} src={videoUrl} className="w-full h-full" controls />}
                {(status === AnalysisStatus.ANALYZING || status === AnalysisStatus.CLIPPING || status === AnalysisStatus.UPLOADING) && (
                  <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center z-20 text-center p-8">
                    <div className="w-24 h-24 mb-6 relative">
                      <div className="absolute inset-0 border-4 border-indigo-500/10 rounded-full animate-pulse"></div>
                      <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
                      <i className={`fas ${status === AnalysisStatus.ANALYZING ? 'fa-brain' : status === AnalysisStatus.CLIPPING ? 'fa-scissors' : 'fa-upload'} text-indigo-500 text-3xl absolute inset-0 flex items-center justify-center`}></i>
                    </div>
                    <h3 className="text-2xl font-bold mb-2 text-white">
                      {status === AnalysisStatus.UPLOADING && 'Reading Video File...'}
                      {status === AnalysisStatus.ANALYZING && 'AI Analyzing Match...'}
                      {status === AnalysisStatus.CLIPPING && 'Extracting Highlights...'}
                    </h3>
                    {status === AnalysisStatus.CLIPPING && (
                      <div className="mt-6 w-full max-w-xs bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${clippingProgress}%` }}></div>
                      </div>
                    )}
                    <p className="text-slate-500 text-sm mt-4">
                      {status === AnalysisStatus.CLIPPING ? `Generating ${clippingProgress}% complete` : 'Please keep this tab open.'}
                    </p>
                  </div>
                )}
              </div>

              {status === AnalysisStatus.COMPLETED && duration > 0 && (
                <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 shadow-xl">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-white">
                      <i className="fas fa-layer-group text-indigo-500"></i> Event Timeline
                    </h3>
                    {targetJersey && (
                      <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">
                        Filtering Player #{targetJersey}
                      </span>
                    )}
                  </div>
                  <Timeline duration={duration} currentTime={currentTime} highlights={filteredHighlights} onMarkerClick={jumpToHighlight} />
                </div>
              )}

              {status === AnalysisStatus.IDLE && (
                <div className="flex justify-center pt-4">
                  <button onClick={startAnalysis} className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold shadow-2xl transition-all transform hover:-translate-y-1 hover:scale-105">
                    Start AI Analysis
                  </button>
                </div>
              )}

              {error && (
                <div className="p-5 bg-rose-500/10 border border-rose-500/50 rounded-2xl text-rose-500 flex items-center gap-4 animate-shake">
                  <i className="fas fa-exclamation-circle"></i>
                  <span className="text-sm font-medium">{error}</span>
                </div>
              )}
            </div>

            <div className="lg:col-span-4 flex flex-col">
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl flex flex-col h-full shadow-2xl overflow-hidden sticky top-24 max-h-[calc(100vh-8rem)]">
                <div className="p-6 border-b border-slate-800 bg-slate-800/20 flex items-center justify-between">
                  <h3 className="font-bold text-lg text-white">
                    {targetJersey ? `Player #${targetJersey}` : 'Highlights'}
                  </h3>
                  <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-bold">
                    {filteredHighlights.length} Clips
                  </span>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                  {status === AnalysisStatus.COMPLETED ? (
                    filteredHighlights.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-8">
                        <i className="fas fa-search text-2xl mb-4"></i>
                        <p>No results for this player.</p>
                      </div>
                    ) : (
                      filteredHighlights.map((h, i) => (
                        <HighlightCard 
                          key={i} 
                          highlight={h} 
                          isActive={Math.abs(currentTime - h.timestampSeconds) < 1.5} 
                          onClick={() => jumpToHighlight(h.timestampSeconds)} 
                        />
                      ))
                    )
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-8 space-y-4">
                      <i className="fas fa-video text-xl opacity-20"></i>
                      <p className="text-sm italic">Analysis required to see event logs.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;