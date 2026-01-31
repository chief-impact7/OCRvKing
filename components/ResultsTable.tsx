import React, { useState } from 'react';
import { GradingResult, StudentSubmission } from '../types';

interface ResultsTableProps {
  submissions: StudentSubmission[];
  onUpdateSubmission: (id: string, updates: Partial<StudentSubmission>) => void;
  onShowToast: (msg: string) => void;
}

const ResultsTable: React.FC<ResultsTableProps> = ({ submissions, onUpdateSubmission, onShowToast }) => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  
  // Inline Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editClass, setEditClass] = useState("");

  const completedSubmissions = submissions.filter(s => s.status === 'completed' && s.result);

  const toggleRow = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  const startEditing = (sub: StudentSubmission) => {
    if (!sub.result) return;
    setEditingId(sub.id);
    setEditName(sub.result.student_name);
    setEditClass(sub.result.student_class || "");
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName("");
    setEditClass("");
  };

  const saveEditing = (id: string) => {
    const sub = submissions.find(s => s.id === id);
    if (!sub || !sub.result) return;

    const updatedResult: GradingResult = {
        ...sub.result,
        student_name: editName,
        student_class: editClass
    };

    onUpdateSubmission(id, { result: updatedResult });
    setEditingId(null);
  };

  /**
   * Generates header and row data suitable for spreadsheet export.
   * Dynamically creates columns for each question (Q1 Answer, Q1 Score, etc.)
   */
  const getExportData = (separator: string) => {
    // 1. Find all unique question numbers
    const allQNums = new Set<number>();
    completedSubmissions.forEach(sub => {
        sub.result?.scores.forEach(s => allQNums.add(s.q_num));
    });
    const sortedQNums = Array.from(allQNums).sort((a, b) => a - b);

    // 2. Build Headers: Class, Name, Total, Q1 Ans, Q1 Score, Q2 Ans, Q2 Score...
    const headers = [
        'Class', 
        'Name', 
        'Total Score', 
        ...sortedQNums.flatMap(q => [`Q${q} Ans`, `Q${q} Score`]), 
        'Feedback'
    ];

    // 3. Build Rows
    const rows = completedSubmissions.map(sub => {
      const res = sub.result as GradingResult;
      // Map q_num -> { score, answer }
      const scoresMap = new Map(res.scores.map(s => [
          s.q_num, 
          { score: s.score, ans: s.student_answer || "-" }
      ]));
      
      const qCols = sortedQNums.flatMap(q => {
          const item = scoresMap.get(q);
          return [
              item ? item.ans : "-",
              item ? item.score.toString() : "0"
          ];
      });

      const rowData = [
        `"${res.student_class || ""}"`,
        `"${res.student_name}"`,
        res.total_score.toString(),
        ...qCols,
        `"${(res.feedback || "").replace(/"/g, '""')}"`
      ];
      
      return rowData.join(separator);
    });

    return { headerStr: headers.join(separator), rowStr: rows.join('\n') };
  };

  const handleExportCSV = () => {
    if (completedSubmissions.length === 0) return;

    const { headerStr, rowStr } = getExportData(',');
    const csvString = [headerStr, rowStr].join('\n');

    // Add BOM (\uFEFF) to force Excel to recognize UTF-8 encoding
    const blob = new Blob(["\uFEFF" + csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "채점결과_grading_results.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    if (onShowToast) onShowToast("CSV 파일이 다운로드되었습니다. (한글 깨짐 방지 적용)");
  };

  const handleCopyToClipboard = async () => {
    if (completedSubmissions.length === 0) return;

    // Use Tab separator for Clipboard copy (works best for Excel/Sheets paste)
    const allQNums = new Set<number>();
    completedSubmissions.forEach(sub => { sub.result?.scores.forEach(s => allQNums.add(s.q_num)); });
    const sortedQNums = Array.from(allQNums).sort((a, b) => a - b);

    // Headers
    const headers = ['Class', 'Name', 'Total Score', ...sortedQNums.flatMap(q => [`Q${q} Ans`, `Q${q} Score`]), 'Feedback'];
    
    // Rows
    const rows = completedSubmissions.map(sub => {
        const res = sub.result as GradingResult;
        const scoresMap = new Map(res.scores.map(s => [
            s.q_num, 
            { score: s.score, ans: s.student_answer || "-" }
        ]));
        
        const qCols = sortedQNums.flatMap(q => {
            const item = scoresMap.get(q);
            return [
                item ? item.ans : "-",
                item ? item.score.toString() : "0"
            ];
        });

        return [
            res.student_class || "",
            res.student_name,
            res.total_score.toString(),
            ...qCols,
            (res.feedback || "").replace(/\t/g, ' ') // Remove tabs from feedback
        ].join('\t');
    });

    const tsvContent = [headers.join('\t'), ...rows].join('\n');

    try {
        await navigator.clipboard.writeText(tsvContent);
        if (onShowToast) onShowToast("데이터가 복사되었습니다! 구글 시트나 엑셀에 붙여넣기(Ctrl+V) 하세요.");
    } catch (err) {
        console.error('Failed to copy: ', err);
        if (onShowToast) onShowToast("클립보드 복사에 실패했습니다.");
    }
  };

  if (submissions.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-center bg-gray-50 gap-4">
        <h2 className="text-lg font-semibold text-gray-800 whitespace-nowrap">채점 결과 (Grading Results)</h2>
        
        <div className="flex gap-2">
            <button
            onClick={handleExportCSV}
            disabled={completedSubmissions.length === 0}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center shadow-sm"
            >
            <i className="fas fa-file-csv mr-2 text-green-600"></i> CSV 다운로드
            </button>
            
            <button
            onClick={handleCopyToClipboard}
            disabled={completedSubmissions.length === 0}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center shadow-md"
            title="복사하여 엑셀/시트에 붙여넣기"
            >
            <i className="fas fa-copy mr-2"></i> 데이터 복사 (Copy)
            </button>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-100 text-gray-600 uppercase font-bold text-xs">
            <tr>
              <th className="px-6 py-3 w-32">상태 (Status)</th>
              <th className="px-6 py-3 w-32">반 (Class)</th>
              <th className="px-6 py-3">이름 (Name)</th>
              <th className="px-6 py-3 w-24">점수 (Score)</th>
              <th className="px-6 py-3 text-right w-32">동작</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {submissions.map((sub) => {
              const result = sub.result;
              const isError = sub.status === 'error';
              const isProcessing = sub.status === 'processing';
              const isEditing = editingId === sub.id;

              return (
                <React.Fragment key={sub.id}>
                  <tr 
                    className={`hover:bg-gray-50 transition-colors ${expandedRow === sub.id ? 'bg-indigo-50' : ''}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                       {isProcessing && <span className="text-blue-500"><i className="fas fa-spinner fa-spin mr-1"></i> 채점 중...</span>}
                       {sub.status === 'completed' && <span className="text-green-500"><i className="fas fa-check-circle mr-1"></i> 완료</span>}
                       {sub.status === 'pending' && <span className="text-gray-400"><i className="fas fa-clock mr-1"></i> 대기</span>}
                       {isError && <span className="text-red-500"><i className="fas fa-exclamation-triangle mr-1"></i> 오류</span>}
                    </td>
                    
                    {/* Class Column */}
                    <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                      {isEditing ? (
                           <input 
                              type="text" 
                              value={editClass} 
                              onChange={(e) => setEditClass(e.target.value)}
                              placeholder="반 입력"
                              className="bg-white text-gray-900 border border-gray-300 rounded px-2 py-1 text-sm w-full focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                           />
                      ) : (
                         result ? (
                             result.student_class && result.student_class !== "반 정보 없음" ? (
                                <span className="inline-block bg-white border border-gray-200 text-gray-800 text-xs font-semibold px-2.5 py-1 rounded shadow-sm">
                                    {result.student_class}
                                </span>
                             ) : (
                                <span className="text-gray-400 text-xs italic">정보 없음</span>
                             )
                         ) : '-'
                      )}
                    </td>

                    {/* Name Column */}
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {isEditing ? (
                           <input 
                              type="text" 
                              value={editName} 
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder="이름 입력"
                              className="bg-white text-gray-900 border border-gray-300 rounded px-2 py-1 text-sm w-full max-w-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                           />
                      ) : (
                         result ? (
                            <div>
                               <div className="text-gray-900 font-semibold">{result.student_name || "이름 없음"}</div>
                               <div className="text-xs text-gray-400 mt-1">{sub.files.length} 페이지</div>
                            </div>
                         ) : (
                            <span className="text-gray-900">{sub.files.map(f => f.name).join(', ')}</span>
                         )
                      )}
                    </td>

                    {/* Score Column */}
                    <td className="px-6 py-4">
                      {result ? (
                        <span className="font-bold text-gray-800 bg-gray-50 px-3 py-1 rounded-lg border border-gray-100">{result.total_score}점</span>
                      ) : '-'}
                    </td>

                    {/* Actions Column */}
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      {result && (
                        <div className="flex items-center justify-end space-x-3">
                           {isEditing ? (
                             <>
                               <button onClick={() => saveEditing(sub.id)} className="text-green-600 hover:text-green-800" title="저장">
                                 <i className="fas fa-save"></i>
                               </button>
                               <button onClick={cancelEditing} className="text-red-500 hover:text-red-700" title="취소">
                                 <i className="fas fa-times"></i>
                               </button>
                             </>
                           ) : (
                             <button onClick={() => startEditing(sub)} className="text-gray-400 hover:text-indigo-600" title="이름/반 수정">
                               <i className="fas fa-pen"></i>
                             </button>
                           )}
                           
                           <button 
                             onClick={() => toggleRow(sub.id)}
                             className="text-indigo-600 hover:text-indigo-900 focus:outline-none"
                             title="상세 보기"
                           >
                              {expandedRow === sub.id ? '접기' : '상세'} <i className={`fas fa-chevron-${expandedRow === sub.id ? 'up' : 'down'} ml-1`}></i>
                           </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {/* Detailed View */}
                  {expandedRow === sub.id && result && (
                    <tr className="bg-indigo-50">
                      <td colSpan={5} className="px-6 py-4">
                        <div className="space-y-3">
                          <h4 className="font-semibold text-indigo-900 border-b border-indigo-200 pb-2">점수 상세 (Score Breakdown)</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {result.scores.map((score, idx) => (
                              <div key={idx} className="bg-white p-3 rounded-lg border border-indigo-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                                <div className="flex justify-between items-center mb-1">
                                  <div className="flex items-center">
                                      <span className="font-bold text-indigo-700 mr-2">문항 {score.q_num}</span>
                                      {score.score > 0 ? (
                                          <i className="fas fa-check text-green-500 text-xs"></i>
                                      ) : (
                                          <i className="fas fa-times text-red-500 text-xs"></i>
                                      )}
                                  </div>
                                  <span className={`font-bold ${score.score > 0 ? 'text-green-600' : 'text-red-500'}`}>{score.score}점</span>
                                </div>
                                <div className="text-sm text-gray-800 mb-1">
                                    <span className="text-gray-500 text-xs mr-1">입력 답안:</span> 
                                    <span className="font-mono font-bold bg-gray-100 px-1.5 rounded">{score.student_answer || "-"}</span>
                                </div>
                                <p className="text-gray-500 text-xs italic truncate">{score.reason}</p>
                              </div>
                            ))}
                          </div>
                          {result.feedback && (
                            <div className="mt-4 pt-2 border-t border-indigo-200">
                                <span className="font-semibold text-indigo-900">피드백 (Feedback): </span>
                                <span className="text-gray-700">{result.feedback}</span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ResultsTable;