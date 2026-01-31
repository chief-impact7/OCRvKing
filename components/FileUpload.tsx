import React, { useRef, useState } from 'react';

interface FileUploadProps {
  label: string;
  subLabel?: string;
  onFileSelect: (files: FileList | File[] | null) => void;
  accept?: string;
  multiple?: boolean;
  selectedFileCount?: number;
  onShowToast?: (msg: string) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({
  label,
  subLabel,
  onFileSelect,
  accept = "application/pdf,image/*",
  multiple = false,
  selectedFileCount = 0,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const triggerSuccess = () => {
    setUploadSuccess(true);
    setTimeout(() => setUploadSuccess(false), 2000);
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files);
      triggerSuccess();
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelect(e.dataTransfer.files);
      e.dataTransfer.clearData();
      triggerSuccess();
    }
  };

  // Determine styles based on state
  let containerClasses = "relative border-2 border-dashed rounded-xl p-8 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center text-center group bg-white min-h-[260px]";
  let iconClass = "fas fa-cloud-upload-alt";
  let iconContainerClass = "bg-indigo-100 text-indigo-600 group-hover:scale-110";
  let textClass = "text-gray-700";
  let subTextClass = "text-gray-500";

  if (uploadSuccess) {
    containerClasses = "relative border-2 border-green-500 bg-green-50 rounded-xl p-8 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center text-center scale-[1.02] shadow-md min-h-[260px]";
    iconClass = "fas fa-check-circle animate-bounce";
    iconContainerClass = "bg-green-200 text-green-700 scale-110";
    textClass = "text-green-800 font-bold";
    subTextClass = "text-green-600";
  } else if (isDragging) {
    containerClasses = "relative border-4 border-indigo-500 bg-indigo-50 rounded-xl p-8 transition-all duration-200 cursor-pointer flex flex-col items-center justify-center text-center scale-[1.02] shadow-xl ring-4 ring-indigo-200 min-h-[260px]";
    iconClass = "fas fa-arrow-down animate-bounce";
    iconContainerClass = "bg-indigo-200 text-indigo-700 scale-125 shadow-sm";
    textClass = "text-indigo-900 font-bold";
    subTextClass = "text-indigo-700";
  } else {
    containerClasses += " border-gray-300 hover:border-indigo-500 hover:bg-indigo-50 hover:shadow-lg";
  }

  return (
    <div 
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={containerClasses}
    >
      <input
        type="file"
        ref={inputRef}
        onChange={handleChange}
        accept={accept}
        multiple={multiple}
        className="hidden"
      />
      
      <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-5 transition-transform duration-300 ${iconContainerClass}`}>
          <i className={`${iconClass} text-3xl`}></i>
      </div>
      
      <h3 className={`text-xl font-semibold transition-colors ${textClass} mb-2`}>
          {uploadSuccess ? "파일 추가 완료!" : (isDragging ? "여기에 놓으세요" : label)}
      </h3>
      
      <p className={`text-sm transition-colors ${subTextClass} max-w-xs mx-auto`}>
          {uploadSuccess 
              ? "다음 단계로 이동할 준비가 되었습니다." 
              : (subLabel || (isDragging ? "파일을 업로드하려면 마우스를 놓으세요." : ""))}
      </p>

      <div className="mt-4 text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
          <i className="fas fa-mobile-alt mr-1"></i> 모바일인가요? 여기를 눌러 파일을 선택하세요.
      </div>
      
      {selectedFileCount > 0 && !isDragging && !uploadSuccess && (
        <div className="absolute bottom-6 px-4 py-1.5 bg-indigo-100 text-indigo-700 rounded-full text-sm font-semibold animate-fade-in-up flex items-center shadow-sm">
          <i className="fas fa-file-alt mr-2"></i>
          {selectedFileCount}개의 파일 선택됨
        </div>
      )}
    </div>
  );
};

export default FileUpload;