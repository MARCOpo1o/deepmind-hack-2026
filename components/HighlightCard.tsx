
import React from 'react';
import { Highlight } from '../types.ts';

interface HighlightCardProps {
  highlight: Highlight;
  isActive: boolean;
  onClick: () => void;
}

const HighlightCard: React.FC<HighlightCardProps> = ({ highlight, isActive, onClick }) => {
  const intensityColors = {
    High: 'bg-rose-500',
    Medium: 'bg-orange-500',
    Low: 'bg-amber-500'
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (highlight.clipUrl) {
      // Use window.document to fix 'Cannot find name document' error
      const a = window.document.createElement('a');
      a.href = highlight.clipUrl;
      a.download = `clip_${highlight.displayTime.replace(':', '-')}_${highlight.scoreType}.mp4`;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
    }
  };

  return (
    <div 
      onClick={onClick}
      className={`group p-4 rounded-xl cursor-pointer transition-all border ${
        isActive 
          ? 'bg-indigo-900/40 border-indigo-500 shadow-lg shadow-indigo-500/10 scale-[1.02]' 
          : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-indigo-400 font-mono font-bold text-lg">{highlight.displayTime}</span>
        <div className="flex flex-col items-end gap-1">
          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded text-white ${intensityColors[highlight.intensity as keyof typeof intensityColors] || 'bg-slate-500'}`}>
            {highlight.intensity}
          </span>
          {highlight.playerJerseyNumber && highlight.playerJerseyNumber !== "Unknown" && (
            <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-600 rounded text-white border border-indigo-400/30">
              #{highlight.playerJerseyNumber}
            </span>
          )}
        </div>
      </div>
      
      <h4 className="text-slate-200 font-semibold mb-1">{highlight.scoreType}</h4>
      <p className="text-slate-400 text-sm line-clamp-2 leading-relaxed mb-3">{highlight.description}</p>
      
      {highlight.clipUrl && (
        <div className="space-y-2">
          <video 
            src={highlight.clipUrl} 
            className="w-full rounded-lg bg-black border border-slate-700 aspect-video" 
            controlsList="nodownload"
            // Cast to any to fix property existence errors on HTMLVideoElement which can happen in certain TS environments
            onMouseEnter={(e) => (e.target as any).play()}
            onMouseLeave={(e) => {
              const v = e.target as any;
              v.pause();
              v.currentTime = 0;
            }}
            muted
          />
          <button 
            onClick={handleDownload}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
          >
            <i className="fas fa-download"></i>
            Download MP4 Clip
          </button>
        </div>
      )}
    </div>
  );
};

export default HighlightCard;