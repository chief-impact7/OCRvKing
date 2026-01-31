import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import StepIndicator from './components/StepIndicator';
import FileUpload from './components/FileUpload';
import ResultsTable from './components/ResultsTable';
import { gradeSubmission } from './services/geminiService';
import { convertPdfToImages } from './services/pdfUtils';
import { AppStep, StudentSubmission, GradingModel } from './types';

// Simple Toast Component
const ToastNotification = ({ message, onClose }: { message: string; onClose: () => void }) => (
  <div className="fixed bottom-4 right-4 z-50 bg-amber-50 border-l-4 border-amber-400 p-4 shadow-lg rounded-md flex items-start animate-bounce-in max-w-md">
    <div className="flex-shrink-0">
      <i className="fas fa-exclamation-circle text-amber-400 mt-0.5"></i>
    </div>
    <div className="ml-3">
      <p className="text-sm font-medium text-amber-800">알림</p>
      <p className="text-sm text-amber-700 mt-1">{message}</p>
    </div>
    <div className="ml-auto pl-3">
       <button onClick={onClose} className="text-amber-400 hover:text-amber-500 focus:outline-none">
         <i className="fas fa-times"></i>
       </button>
    </div>
  </div>
);

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.SETUP);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [model, setModel] = useState<GradingModel>('gemini-3-flash-preview');
  const [isGrading, setIsGrading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  
  // Staging state for the "Add Student" feature
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  
  // Bulk Upload State
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [pagesPerStudent, setPagesPerStudent] = useState(1);

  // Settings State
  const [showDevSettings, setShowDevSettings] = useState(false);

  // Step 1: Handle Reference File
  const handleReferenceSelect = (files: FileList | File[] | null) => {
    if (!files) return;
    // Handle both FileList and File[]
    const file = Array.isArray(files) ? files[0] : files[0];
    if (file) {
      setReferenceFile(file);
    }
  };

  const showToast = (msg: string) => {
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 6000);
  };

  // Step 2: Handle File Selection (Standard or Bulk)
  const handleFileSelect = async (files: FileList | File[] | null) => {
    if (!files) return;
    
    // Convert to Array for uniform handling
    const fileArray = Array.isArray(files) ? files : Array.from(files);
    if (fileArray.length === 0) return;

    // 1. Bulk Mode Logic
    if (isBulkMode) {
      const file = fileArray[0];
      if (file.type !== 'application/pdf') {
        showToast("대량 업로드 모드는 PDF 파일만 지원합니다.");
        return;
      }

      setIsProcessingPdf(true);
      try {
        const images = await convertPdfToImages(file);
        
        // Split images into students based on pagesPerStudent
        const newSubmissions: StudentSubmission[] = [];
        for (let i = 0; i < images.length; i += pagesPerStudent) {
          const studentImages = images.slice(i, i + pagesPerStudent);
          if (studentImages.length > 0) {
            newSubmissions.push({
              id: uuidv4(),
              files: studentImages,
              status: 'pending'
            });
          }
        }

        setSubmissions(prev => [...prev, ...newSubmissions]);
        showToast(`PDF 처리 완료! 총 ${newSubmissions.length}명의 학생 답안이 추가되었습니다.`);
      } catch (e) {
        console.error(e);
        showToast("PDF 처리 중 오류가 발생했습니다. 다시 시도해주세요.");
      } finally {
        setIsProcessingPdf(false);
      }
      return;
    }

    // 2. Standard Mode (Staging) Logic
    setStagedFiles((prev) => [...prev, ...fileArray]);
  };

  // Step 2: Confirm Staged Files as One Submission (Standard Mode Only)
  const addStudentToQueue = () => {
    if (stagedFiles.length === 0) return;

    const newSubmission: StudentSubmission = {
      id: uuidv4(),
      files: stagedFiles,
      status: 'pending',
    };

    setSubmissions((prev) => [...prev, newSubmission]);
    setStagedFiles([]); // Reset staging for next student
  };

  const removeStagedFile = (index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeSubmission = (id: string) => {
    setSubmissions((prev) => prev.filter((s) => s.id !== id));
  };

  // Update submission handler (e.g., for correcting name/class)
  const updateSubmission = (id: string, updates: Partial<StudentSubmission>) => {
    setSubmissions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  // Step 3: Grading Logic
  const startGrading = async () => {
    if (!referenceFile || submissions.length === 0) return;
    
    setIsGrading(true);
    setCurrentStep(AppStep.GRADING);
    setToastMessage(null);

    // Process sequentially to avoid rate limits (or could use Promise.all for small batches)
    const newSubmissions = [...submissions];

    for (let i = 0; i < newSubmissions.length; i++) {
        // Update status to processing
        newSubmissions[i] = { ...newSubmissions[i], status: 'processing' };
        setSubmissions([...newSubmissions]);

        try {
            const result = await gradeSubmission(referenceFile, newSubmissions[i].files, model);
            
            if (result.hasOCRIssues) {
                showToast("일부 학생의 이름이나 반 정보를 읽지 못했습니다. 기본값으로 설정되었으니 확인해주세요.");
            }

            newSubmissions[i] = { 
                ...newSubmissions[i], 
                status: 'completed', 
                result 
            };
        } catch (error) {
            newSubmissions[i] = { 
                ...newSubmissions[i], 
                status: 'error', 
                errorMsg: error instanceof Error ? error.message : 'Unknown error' 
            };
        }
        setSubmissions([...newSubmissions]);
    }

    setIsGrading(false);
  };

  // UI Components
  return (
    <div className="min-h-screen flex flex-col relative">
      {/* Toast Notification */}
      {toastMessage && (
        <ToastNotification message={toastMessage} onClose={() => setToastMessage(null)} />
      )}

      {/* Loading Overlay for PDF Processing */}
      {isProcessingPdf && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center flex-col text-white">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white mb-4"></div>
          <p className="text-lg font-semibold">대량 PDF 처리중...</p>
          <p className="text-sm opacity-80">페이지를 분석하여 학생별로 나누고 있습니다.</p>
        </div>
      )}
      
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center">
                <div className="bg-indigo-600 p-2 rounded-lg mr-3">
                    <i className="fas fa-graduation-cap text-white text-lg"></i>
                </div>
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">AutoGrade AI</h1>
            </div>
            <div className="text-sm text-gray-500">
                Powered by Gemini 3.0 Flash
            </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Workflow Steps */}
        <StepIndicator currentStep={currentStep} />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar / Configuration */}
            <aside className="lg:col-span-1 space-y-6">
                
                {/* Reference File Info (Always Visible) */}
                {referenceFile ? (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                         <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">정답지 (Reference)</h3>
                         <div className="flex items-center text-sm text-indigo-700 bg-indigo-50 p-2 rounded">
                            <i className="fas fa-file-pdf mr-2"></i>
                            <span className="truncate">{referenceFile.name}</span>
                         </div>
                         <button 
                            onClick={() => {
                                setReferenceFile(null);
                                setCurrentStep(AppStep.SETUP);
                            }}
                            className="mt-3 text-xs text-red-500 hover:text-red-700"
                        >
                            삭제 (Remove)
                         </button>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center text-gray-400 text-sm">
                        선택된 정답지가 없습니다.
                    </div>
                )}

                {/* Developer / Advanced Settings Toggle */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <button 
                        onClick={() => setShowDevSettings(!showDevSettings)}
                        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                    >
                        <span className="font-semibold text-gray-800 text-sm">
                            <i className="fas fa-cogs mr-2 text-gray-500"></i> 고급 설정 (Advanced)
                        </span>
                        <i className={`fas fa-chevron-${showDevSettings ? 'up' : 'down'} text-gray-400 text-xs`}></i>
                    </button>
                    
                    {showDevSettings && (
                        <div className="p-6 pt-0 border-t border-gray-100 bg-gray-50">
                            {/* Grading Configuration */}
                            <div className="mt-4 mb-2">
                                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">AI 모델 (Model)</label>
                                <select 
                                    value={model}
                                    onChange={(e) => setModel(e.target.value as GradingModel)}
                                    className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-xs p-2 border"
                                >
                                    <option value="gemini-3-flash-preview">Gemini 3.0 Flash (빠름)</option>
                                    <option value="gemini-3-pro-preview">Gemini 3.0 Pro (정밀함)</option>
                                </select>
                            </div>

                            <div className="mb-2">
                                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">OCR 규칙</label>
                                <div className="text-xs text-indigo-700 bg-white p-2 rounded border border-indigo-100">
                                    "V" 체크표시만 정답으로 인정합니다.
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="lg:col-span-3 space-y-6">
                
                {/* Step 1: Reference Upload */}
                {currentStep === AppStep.SETUP && (
                    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 animate-fade-in-up">
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">정답지 업로드</h2>
                        <p className="text-gray-600 mb-6">채점 기준이 될 정답지나 모범 답안(PDF 또는 이미지)을 업로드해주세요.</p>
                        
                        <FileUpload 
                            label="정답지 파일 드래그 & 드롭"
                            subLabel="또는 클릭하여 파일 선택"
                            onFileSelect={handleReferenceSelect}
                            onShowToast={showToast}
                        />

                        {referenceFile && (
                            <div className="mt-6 flex justify-end">
                                <button 
                                    onClick={() => setCurrentStep(AppStep.UPLOAD_STUDENTS)}
                                    className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md transition-all font-medium flex items-center"
                                >
                                    다음: 학생 답안지 추가 <i className="fas fa-arrow-right ml-2"></i>
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 2: Student Uploads (Multi-Page Support) */}
                {currentStep === AppStep.UPLOAD_STUDENTS && (
                    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden animate-fade-in-up">
                        <div className="p-8">
                             <div className="flex flex-col md:flex-row md:items-center justify-between mb-4">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-800">학생 답안지 제출</h2>
                                    <p className="text-gray-600 text-sm mt-1">
                                        학생별 파일을 업로드하거나, 전체 답안이 묶인 PDF를 업로드하세요.
                                    </p>
                                </div>
                                
                                {/* Bulk Toggle */}
                                <div className="mt-4 md:mt-0 bg-gray-50 p-3 rounded-lg border border-gray-200 flex items-center">
                                    <label className="flex items-center cursor-pointer select-none">
                                        <div className="relative">
                                            <input 
                                                type="checkbox" 
                                                className="sr-only" 
                                                checked={isBulkMode} 
                                                onChange={() => {
                                                    setIsBulkMode(!isBulkMode);
                                                    setStagedFiles([]); // Clear staging if switching modes
                                                }}
                                            />
                                            <div className={`block w-10 h-6 rounded-full transition-colors ${isBulkMode ? 'bg-indigo-600' : 'bg-gray-300'}`}></div>
                                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${isBulkMode ? 'transform translate-x-4' : ''}`}></div>
                                        </div>
                                        <span className="ml-3 text-sm font-medium text-gray-700">대량 업로드 모드 (Bulk)</span>
                                    </label>
                                    
                                    {/* Tooltip for Bulk Mode */}
                                    <div className="relative group ml-2">
                                        <i className="fas fa-question-circle text-gray-400 hover:text-indigo-600 cursor-help"></i>
                                        <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 w-64 p-3 bg-gray-800 text-white text-xs rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-center leading-relaxed">
                                            모든 학생의 답안이 포함된 1개의 큰 PDF 파일을 업로드하세요. 설정된 페이지 수에 따라 자동으로 학생별로 분할됩니다.
                                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
                                        </div>
                                    </div>
                                </div>
                             </div>

                             <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                                {/* Left: Upload Area */}
                                <div className="space-y-4">
                                    {isBulkMode && (
                                        <div className="mb-6 bg-indigo-50 border border-indigo-200 rounded-xl p-5 animate-fade-in shadow-sm relative overflow-hidden">
                                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                                <i className="fas fa-file-pdf text-6xl text-indigo-900"></i>
                                            </div>
                                            
                                            <h4 className="font-bold text-indigo-900 mb-2 flex items-center text-base">
                                                <i className="fas fa-magic mr-2"></i> PDF 자동 분할
                                            </h4>
                                            <p className="text-sm text-indigo-800 mb-4 leading-relaxed max-w-lg">
                                                모든 학생의 답안이 합쳐진 <strong>단일 PDF 파일</strong>을 업로드하세요. 아래 설정한 페이지 수만큼씩 자동으로 잘라서 처리합니다.
                                                <br/>
                                                <span className="text-xs text-indigo-600 mt-1 inline-block font-medium">
                                                    <i className="fas fa-robot mr-1"></i> 학생 이름과 반 정보는 AI가 자동으로 인식합니다.
                                                </span>
                                            </p>

                                            <div className="bg-white/60 p-3 rounded-lg border border-indigo-100 inline-flex flex-col sm:flex-row sm:items-center backdrop-blur-sm">
                                                <span className="text-sm font-semibold text-indigo-900 mr-4 mb-2 sm:mb-0">
                                                    학생 1명당 페이지 수:
                                                </span>
                                                <div className="flex items-center space-x-2">
                                                    <button 
                                                        onClick={() => setPagesPerStudent(1)}
                                                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${pagesPerStudent === 1 ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                                                    >
                                                        1장
                                                    </button>
                                                    <button 
                                                        onClick={() => setPagesPerStudent(2)}
                                                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${pagesPerStudent === 2 ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                                                    >
                                                        2장
                                                    </button>
                                                    <div className="flex items-center border border-gray-200 rounded-md bg-white px-2 py-1 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
                                                        <span className="text-xs text-gray-900 font-medium mr-2 whitespace-nowrap">직접입력:</span>
                                                        <input 
                                                            type="number" 
                                                            min="1" 
                                                            value={pagesPerStudent} 
                                                            onChange={(e) => setPagesPerStudent(Math.max(1, parseInt(e.target.value) || 1))}
                                                            className="w-12 text-center text-sm outline-none text-gray-900 font-bold bg-white"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <FileUpload 
                                        label={isBulkMode ? "통합 PDF 파일 업로드 (대량)" : "학생 답안지 업로드"} 
                                        subLabel={isBulkMode ? "자동으로 분할할 큰 PDF 파일 1개 선택" : "학생 1명의 답안지 이미지/PDF 선택"}
                                        onFileSelect={handleFileSelect} // Unified handler
                                        multiple={!isBulkMode}
                                        selectedFileCount={isBulkMode ? 0 : stagedFiles.length}
                                        accept={isBulkMode ? "application/pdf" : "application/pdf,image/*"}
                                        onShowToast={showToast}
                                    />
                                    
                                    {!isBulkMode && stagedFiles.length > 0 && (
                                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">선택된 페이지 ({stagedFiles.length}장)</h4>
                                            <ul className="space-y-2 mb-4">
                                                {stagedFiles.map((f, idx) => (
                                                    <li key={idx} className="flex justify-between items-center text-sm bg-white p-2 rounded shadow-sm">
                                                        <span className="truncate text-gray-700 w-4/5"><i className="fas fa-image text-gray-400 mr-2"></i>{f.name}</span>
                                                        <button onClick={() => removeStagedFile(idx)} className="text-red-400 hover:text-red-600">
                                                            <i className="fas fa-times"></i>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                            <button 
                                                onClick={addStudentToQueue}
                                                className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm transition-colors"
                                            >
                                                대기 목록에 추가 <i className="fas fa-plus ml-1"></i>
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Right: Queue */}
                                <div className="border-l pl-8 border-gray-100">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="font-bold text-gray-700">제출 대기 목록 (Queue)</h3>
                                        <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full text-xs font-bold">{submissions.length} 명</span>
                                    </div>
                                    
                                    {submissions.length === 0 ? (
                                        <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-100 rounded-lg">
                                            <i className="fas fa-inbox text-3xl mb-2"></i>
                                            <p className="text-sm">대기 중인 답안이 없습니다.</p>
                                        </div>
                                    ) : (
                                        <ul className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto border rounded-lg bg-gray-50">
                                            {submissions.map((sub, idx) => (
                                                <li key={sub.id} className="px-4 py-3 flex justify-between items-start text-sm bg-white hover:bg-gray-50">
                                                    <div>
                                                        <div className="font-medium text-gray-900">학생 #{idx + 1}</div>
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            {sub.files.length} 페이지
                                                            {sub.files.length > 0 && <span className="text-gray-400 mx-1">|</span>}
                                                            <span className="italic truncate max-w-[150px] inline-block align-bottom">{sub.files[0]?.name}</span>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => removeSubmission(sub.id)} className="text-gray-400 hover:text-red-500 mt-1">
                                                        <i className="fas fa-trash-alt"></i>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                             </div>

                             <div className="flex justify-between mt-6 pt-6 border-t border-gray-200">
                                <button 
                                    onClick={() => setCurrentStep(AppStep.SETUP)}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-900"
                                >
                                    뒤로
                                </button>
                                <button 
                                    onClick={startGrading}
                                    disabled={submissions.length === 0}
                                    className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    채점 시작 ({submissions.length}명) <i className="fas fa-robot ml-2"></i>
                                </button>
                             </div>
                        </div>
                    </div>
                )}

                {/* Step 3: Results */}
                {currentStep === AppStep.GRADING && (
                    <div className="space-y-6 animate-fade-in-up">
                        {/* Progress Bar */}
                        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                             <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-medium text-gray-700">
                                    {isGrading ? '채점 진행 중...' : '채점 완료'}
                                </span>
                                <span className="text-sm font-bold text-indigo-600">
                                    {Math.round((submissions.filter(s => s.status === 'completed' || s.status === 'error').length / submissions.length) * 100)}%
                                </span>
                             </div>
                             <div className="w-full bg-gray-200 rounded-full h-2.5">
                                <div 
                                    className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500" 
                                    style={{ width: `${(submissions.filter(s => s.status === 'completed' || s.status === 'error').length / submissions.length) * 100}%` }}
                                ></div>
                             </div>
                        </div>

                        <ResultsTable 
                            submissions={submissions} 
                            onUpdateSubmission={updateSubmission} 
                            onShowToast={showToast}
                        />
                        
                        {!isGrading && (
                             <div className="flex justify-end">
                                <button 
                                    onClick={() => {
                                        setSubmissions([]);
                                        setCurrentStep(AppStep.UPLOAD_STUDENTS);
                                        // Reset Bulk Mode settings
                                        setIsBulkMode(false);
                                        setPagesPerStudent(1);
                                    }}
                                    className="px-4 py-2 text-indigo-600 hover:text-indigo-800 font-medium"
                                >
                                    새로운 채점 시작하기
                                </button>
                             </div>
                        )}
                    </div>
                )}
            </div>
        </div>
      </main>
    </div>
  );
};

export default App;