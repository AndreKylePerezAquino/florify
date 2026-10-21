import React from 'react';
import { AlertCircle, ArrowLeft } from 'lucide-react';

interface NotFoundPageProps {
  navigate: (path: string) => void;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({ navigate }) => {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 space-y-4">
      <div className="h-16 w-16 rounded-2xl bg-[#FFF7F9] border border-[#FDC3D1] flex items-center justify-center text-[#C72C5E]">
        <AlertCircle className="h-8 w-8" />
      </div>
      <h1 className="text-xl font-bold text-[#2E1826]">Page Not Found</h1>
      <p className="text-xs text-[#826674] max-w-sm">
        The requested URL does not exist or you do not have permission to access it.
      </p>
      <button
        onClick={() => navigate('/admin')}
        className="px-4 py-2 bg-[#FF5C89] text-white text-xs font-semibold rounded-lg hover:bg-[#C72C5E] transition-colors flex items-center gap-1.5"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Return to Dashboard
      </button>
    </div>
  );
};
