import google.generativeai as genai
import json
import time
from typing import Dict, Any, List

class GraderAI:
    def __init__(self, api_key: str, model_name: str = "gemini-1.5-flash"):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(
            model_name=model_name,
            generation_config={"response_mime_type": "application/json"},
            system_instruction="""
            너는 엄격하고 공정한 시험 채점관이다. 
            제공된 [정답지/채점기준]과 [학생 답안]을 비교하여 각 문제별로 채점하라.
            
            반드시 다음 JSON 형식으로만 응답하라:
            {
                "student_name": "답안지에서 식별된 학생 이름 (없으면 'Unknown')",
                "scores": [
                    {"q_num": 1, "score": 10, "max_score": 10, "reason": "정답"},
                    {"q_num": 2, "score": 0, "max_score": 5, "reason": "오답: 계산 실수"}
                ],
                "total_score": 85,
                "feedback": "전반적으로 우수하나 계산 실수가 조금 있습니다."
            }
            """
        )

    def upload_file(self, file_path: str, mime_type: str = None) -> Any:
        """Gemini 서버로 파일을 업로드합니다."""
        try:
            # 파일이 처리될 때까지 대기
            file = genai.upload_file(file_path, mime_type=mime_type)
            # Active 상태가 될 때까지 폴링
            while file.state.name == "PROCESSING":
                time.sleep(1)
                file = genai.get_file(file.name)
            
            if file.state.name == "FAILED":
                raise ValueError(f"File upload failed: {file.state.name}")
                
            return file
        except Exception as e:
            raise RuntimeError(f"Failed to upload file to Gemini: {e}")

    def grade_submission(self, reference_file, student_file, ocr_rules: str = "") -> Dict[str, Any]:
        """
        정답지(reference_file)와 학생 답안(student_file)을 비교 채점합니다.
        ocr_rules가 제공되면 이를 채점 기준에 반영합니다.
        """
        prompt = "이 학생의 답안을 정답지와 비교하여 채점해주세요."
        if ocr_rules:
            prompt += f"\n\n[추가 OCR 및 채점 규칙]\n{ocr_rules}"
        
        try:
            response = self.model.generate_content(
                [reference_file, student_file, prompt],
                request_options={"timeout": 600} # 긴 처리 시간을 고려하여 타임아웃 증대
            )
            
            return json.loads(response.text)
            
        except Exception as e:
            print(f"Grading Error: {e}")
            return {
                "student_name": "Error",
                "total_score": 0,
                "feedback": f"채점 중 오류 발생: {str(e)}",
                "scores": []
            }
