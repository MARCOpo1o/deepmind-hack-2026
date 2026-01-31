import React from 'react';
import { Highlight } from '../types.ts';

interface TimelineProps {
  duration: number;
  currentTime: number;
  highlights: Highlight[];
  onMarkerClick: (seconds: number) => void;
}

const Timeline: React.FC<TimelineProps> = ({ duration, currentTime, highlights, onMarkerClick }) => {
  const progress = (currentTime / duration) * 100;

  return (
    <div className="relative w-full h-8 bg-slate-800 rounded-lg overflow-visible group cursor-pointer mb-6">
      {/* Background Track */}
      <div className="absolute inset-y-3 left-0 right-0 bg-slate-700 rounded-full h-2"></div>
      
      {/* Progress Track */}
      <div 
        className="absolute inset-y-3 left-0 bg-indigo-500 rounded-full h-2 transition-all duration-150"
        style={{ width: `${progress}%` }}
      ></div>

      {/* Highlight Markers */}
      {highlights.map((h, i) => {
        const markerPos = (h.timestampSeconds / duration) * 100;
        const isPast = currentTime > h.timestampSeconds;
        
        return (
          <button
            key={i}
            onClick={() => onMarkerClick(h.timestampSeconds)}
            className="absolute top-0 w-4 h-8 flex items-center justify-center transform -translate-x-1/2 transition-all hover:scale-125 z-10"
            style={{ left: `${markerPos}%` }}
            title={`${h.displayTime}: ${h.description}`}
          >
            <div className={`w-1.5 h-full rounded-full ${isPast ? 'bg-indigo-300' : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]'}`}></div>
          </button>
        );
      })}
    </div>
  );
};

export default Timeline;