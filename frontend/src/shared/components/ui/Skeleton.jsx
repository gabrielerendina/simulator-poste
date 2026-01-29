export const SkeletonCard = () => (
  <div className="bg-white rounded-lg border border-slate-200 p-6 animate-pulse">
    <div className="h-4 bg-slate-200 rounded w-3/4 mb-4"></div>
    <div className="h-4 bg-slate-200 rounded w-1/2 mb-2"></div>
    <div className="h-4 bg-slate-200 rounded w-5/6"></div>
  </div>
);

export const SkeletonGauge = () => (
  <div className="h-40 w-full flex items-center justify-center animate-pulse">
    <div className="w-32 h-32 rounded-full bg-slate-200"></div>
  </div>
);

export const LoadingSpinner = ({ size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <div className="flex items-center justify-center">
      <div className={`${sizeClasses[size]} border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin`}></div>
    </div>
  );
};

export const LoadingOverlay = ({ message = 'Caricamento...' }) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 shadow-xl">
      <LoadingSpinner size="lg" />
      <p className="mt-4 text-slate-700 font-medium">{message}</p>
    </div>
  </div>
);
