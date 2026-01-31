
import React, { useState } from 'react';
import { Highlight } from '../types.ts';

interface HighlightCardProps {
  highlight: Highlight;
  isActive: boolean;
  isSaved?: boolean;
  onSave?: () => void;
  onRemove?: () => void;
  onClick: () => void;
  sourceInfo?: string;
}

const HighlightCard: React.FC<HighlightCardProps> = ({ 
  highlight, 
  isActive, 
  isSaved = false, 
  onSave, 
  onRemove,
  onClick,
  sourceInfo 
}) => {
  const [saving, setSaving] = useState(false);

  const intensityColors = {
    High: 'bg-rose-500',
    Medium: 'bg-orange-500',
    Low: 'bg-amber-500'
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (highlight.clipUrl) {
      const a = (window as any).document.createElement('a');
      a.href = highlight.clipUrl;
      a.download = `highlight_${highlight.displayTime.replace(':', '-')}.mp4`;
      (window as any).document.body.appendChild(a);
      a.click();
      (window as any).document.body.removeChild(a);
    }
  };

  const handleSaveAction = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSaved) {
      onRemove?.();
    } else {
      setSaving(true);
      await onSave?.();
      setSaving(false);
    }
  };

  return (
    <div 
      onClick={onClick}
      className={`p-4 rounded-xl cursor-pointer transition-all border ${
        isActive 
          ? 'bg-indigo-900/30 border-indigo-500 shadow-lg' 
          : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800'
      }`}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex flex-col">
          <span className="text-indigo-400 font-mono font-bold text-lg">{highlight.displayTime}</span>
          {sourceInfo && <span className="text-[9px] text-slate-500 truncate max-w-[150px]">{sourceInfo}</span>}
        </div>
        <button 
          onClick={handleSaveAction}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
            isSaved ? 'bg-rose-500 text-white' : 'bg-slate-700/50 text-slate-400 hover:text-white'
          }`}
        >
          <i className={`fas ${saving ? 'fa-spinner animate-spin' : isSaved ? 'fa-heart' : 'fa-heart'}`}></i>
        </button>
      </div>
      
      <div className="flex gap-2 items-center mb-2">
        <span className="text-white font-bold text-sm">{highlight.scoreType}</span>
        <div className="flex gap-1 ml-auto">
          <span className={`px-2 py-0.5 text-[10px] rounded text-white ${intensityColors[highlight.intensity as keyof typeof intensityColors] || 'bg-slate-600'}`}>
            {highlight.intensity}
          </span>
          {highlight.playerJerseyNumber && highlight.playerJerseyNumber !== "Unknown" && (
            <span className="px-2 py-0.5 text-[10px] bg-indigo-600 rounded text-white">#{highlight.playerJerseyNumber}</span>
          )}
        </div>
      </div>
      
      <p className="text-slate-400 text-xs mb-3 line-clamp-2 leading-relaxed">{highlight.description}</p>
      
      {highlight.clipUrl ? (
        <div className="space-y-2">
          <video src={highlight.clipUrl} className="w-full rounded-lg bg-black border border-slate-700 aspect-video" muted />
          <button onClick={handleDownload} className="w-full py-2 bg-slate-700 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2">
            <i className="fas fa-download"></i> Download Clip
          </button>
        </div>
      ) : (
        <button 
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          className="w-full py-2 border border-slate-700 hover:border-indigo-500 text-slate-400 hover:text-indigo-400 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
        >
          <i className="fas fa-play"></i> Jump to Moment
        </button>
      )}
    </div>
  );
};

export default HighlightCard;
