import React from 'react';
import { AppStep } from '../types';

interface StepIndicatorProps {
  currentStep: AppStep;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  const steps = [
    { id: AppStep.SETUP, label: '정답지 설정' },
    { id: AppStep.UPLOAD_STUDENTS, label: '학생 답안 업로드' },
    { id: AppStep.GRADING, label: '채점 결과' },
  ];

  return (
    <div className="w-full py-6 px-4 mb-6">
      <div className="flex items-center justify-center space-x-4">
        {steps.map((step, index) => (
          <React.Fragment key={step.id}>
            <div className={`flex items-center ${index !== 0 ? 'flex-1 max-w-[100px] hidden sm:flex' : ''}`}>
               {index !== 0 && (
                  <div className={`h-1 w-full rounded ${step.id <= currentStep ? 'bg-indigo-600' : 'bg-gray-300'}`}></div>
               )}
            </div>
            
            <div className="flex flex-col items-center z-10">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg transition-colors duration-300 ${
                  step.id <= currentStep
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {step.id < currentStep ? <i className="fas fa-check"></i> : step.id}
              </div>
              <span className={`mt-2 text-xs font-medium ${step.id <= currentStep ? 'text-indigo-800' : 'text-gray-500'}`}>
                {step.label}
              </span>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default StepIndicator;