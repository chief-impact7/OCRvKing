import streamlit as st
import os
import pandas as pd
from typing import List, Dict
import google.generativeai as genai
import json
from grader import GraderAI
import utils
import time

# 페이지 설정
st.set_page_config(
    page_title="AI 자동 채점 도우미",
    layout="wide"
)

# 세션 상태 초기화
if "processed_files" not in st.session_state:
    st.session_state.processed_files = []
if "grading_results" not in st.session_state:
    st.session_state.grading_results = []
if "api_key_configured" not in st.session_state:
    st.session_state.api_key_configured = False

def main():
    st.title("AI 자동 채점 도우미")
    st.markdown("선생님의 채점 업무를 Gemini가 도와드립니다.")

    # 사이드바 설정
    with st.sidebar:
        st.header("설정 (Settings)")
        
        # 1. Gemini API Key
        secret_api_key = st.secrets.get("GEMINI_API_KEY")
        if secret_api_key:
            api_key = secret_api_key
            st.success("인증 정보가 Secrets에서 자동으로 확인되었습니다.")
            st.session_state.api_key_configured = True
            genai.configure(api_key=api_key)
        else:
            api_key = st.text_input(
                "Gemini API Key",
                type="password",
                help="Google AI Studio에서 발급받은 API 키를 입력하세요."
            )
            
            if api_key:
                try:
                    genai.configure(api_key=api_key)
                    st.session_state.api_key_configured = True
                    st.success("API 키가 설정되었습니다.")
                except Exception as e:
                    st.error(f"API 키 설정 실패: {str(e)}")
        
        st.divider()
        
        # 2. 모델 선택
        model_options = {
            "Gemini 3.0 Flash (Recommended)": "gemini-2.0-flash-exp",
            "Gemini 1.5 Flash": "gemini-1.5-flash",
            "Gemini 1.5 Pro": "gemini-1.5-pro"
        }
        
        selected_model_label = st.selectbox(
            "채점 모델 선택",
            options=list(model_options.keys()),
            index=0,
            help="가장 빠르고 강력한 Gemini 3.0 Flash 모델 사용을 권장합니다."
        )
        model_name = model_options[selected_model_label]
        
        st.divider()
        
        # 3. Google Drive/Sheet 설정
        st.subheader("Google 연동")
        service_account = st.file_uploader(
            "Service Account Key (JSON)",
            type=["json"],
            help="구글 시트/드라이브 연동을 위한 키 파일입니다."
        )

    # 메인 워크플로우
    if not st.session_state.api_key_configured:
        st.warning("왼쪽 사이드바에서 Gemini API Key를 먼저 설정해주세요.")
        return

    tab1, tab2, tab3 = st.tabs(["1단계 정답지 등록", "2단계 학생 답안 제출", "3단계 채점 및 결과"])

    # Tab 1: 정답지 등록
    with tab1:
        st.header("정답 및 채점 기준 등록")
        st.info("채점의 기준이 되는 정답지 또는 모범 답안 파일을 업로드해주세요.")
        
        reference_file = st.file_uploader(
            "정답지 파일 (PDF/이미지)",
            type=["pdf", "png", "jpg", "jpeg"],
            key="ref_file"
        )
        
        if reference_file:
            # 임시 파일로 저장하여 경로 확보
            ref_path = utils.save_uploaded_file(reference_file)
            st.session_state['ref_file_path'] = ref_path
            st.success(f"정답지 파일 로드 완료: {reference_file.name}")

    # Tab 2: 학생 답안 제출
    with tab2:
        st.header("학생 답안지 제출")
        
        input_method = st.radio("제출 방식 선택", ["직접 파일 업로드", "Google Drive 폴더 연동"])
        
        if input_method == "직접 파일 업로드":
            student_files = st.file_uploader(
                "학생 답안 파일들 (여러 개 선택 가능)",
                type=["pdf", "png", "jpg", "jpeg"],
                accept_multiple_files=True
            )
            if student_files:
                st.success(f"총 {len(student_files)}개의 답안 파일이 선택되었습니다.")
        
        else: # Google Drive 폴더 연동
            drive_link = st.text_input("Google Drive 폴더 공유 링크")
            st.markdown("""
            > [!TIP]
            > 반드시 해당 폴더를 다음 이메일 주소로 공유(편집자 권한) 해주세요:
            > (Service Account Email이 여기에 표시될 예정)
            """)
            if st.button("드라이브에서 파일 가져오기"):
                st.info("기능 구현 중입니다.")

    # Tab 3: 채점 및 결과
    with tab3:
        st.header("채점 진행 및 결과 저장")
        
        if st.button("채점 시작 (Start Grading)", type="primary"):
            if not st.session_state.get('ref_file_path'):
                 st.error("먼저 1단계 탭에서 정답지를 등록해주세요.")
                 return
            
            if not student_files and input_method == "직접 파일 업로드":
                 st.error("채점할 학생 답안 파일이 없습니다.")
                 return

            st.write("채점을 시작합니다.")
            progress_bar = st.progress(0)
            status_text = st.empty()
            
            results = []
            
            # Grader 인스턴스 생성
            grader = GraderAI(api_key=api_key, model_name=model_name)
            
            # 정답지 업로드 (최초 1회)
            status_text.text("정답지 분석 중...")
            try:
                ref_file_obj = grader.upload_file(st.session_state['ref_file_path'])
            except Exception as e:
                st.error(f"정답지 처리 실패: {e}")
                return

            total_files = len(student_files) if student_files else 0
            
            for idx, s_file in enumerate(student_files):
                status_text.text(f"채점 중... ({idx+1}/{total_files}): {s_file.name}")
                
                # 학생 파일 임시 저장 및 업로드
                s_file_path = utils.save_uploaded_file(s_file)
                try:
                    student_file_obj = grader.upload_file(s_file_path)
                    
                    # 채점 수행
                    result = grader.grade_submission(ref_file_obj, student_file_obj)
                    result['file_name'] = s_file.name # 원본 파일명 보존
                    results.append(result)
                    
                except Exception as e:
                    st.error(f"{s_file.name} 채점 실패: {e}")
                    results.append({"student_name": "Error", "file_name": s_file.name, "total_score": 0, "feedback": str(e)})
                finally:
                    # 임시 파일 삭제
                    if os.path.exists(s_file_path):
                        os.unlink(s_file_path)
                
                # 진행률 업데이트
                progress_bar.progress((idx + 1) / total_files)
                time.sleep(1) # Rate Limit 고려

            st.session_state.grading_results = results
            st.success("모든 채점이 완료되었습니다!")
            status_text.text("완료")
        
        st.subheader("채점 결과")
        if st.session_state.grading_results:
            df = pd.DataFrame(st.session_state.grading_results)
            # 주요 컬럼만 표시
            st.dataframe(df[["student_name", "total_score", "feedback", "file_name"]])
            
            # 상세 JSON 다운로드 버튼
            json_str = json.dumps(st.session_state.grading_results, ensure_ascii=False, indent=2)
            st.download_button(
                label="결과 JSON 다운로드",
                data=json_str,
                file_name="grading_results.json",
                mime="application/json"
            )

if __name__ == "__main__":
    main()
