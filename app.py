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
    page_title="AutoGrade AI",
    layout="wide",
    initial_sidebar_state="collapsed" # 디자인상 사이드바 숨김
)

# 커스텀 CSS
st.markdown("""
<style>
    /* 기본 배경 및 폰트 설정 */
    .stApp {
        background-color: #fcfcfd;
        font-family: 'Inter', 'Pretendard', -apple-system, sans-serif;
    }
    
    /* 메인 컨테이너 비율 조정 */
    .main .block-container {
        padding-top: 1.5rem;
        max-width: 1100px;
    }

    /* 헤더 디자인 */
    .header-container {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem 2rem;
        background-color: #ffffff;
        border-bottom: 1px solid #f1f3f5;
    }
    .header-title {
        font-size: 1.4rem;
        font-weight: 800;
        color: #212529; /* 메인 텍스트 컬러 */
        letter-spacing: -0.04em;
    }

    /* 모든 텍스트 컬러 통일 */
    p, label, span, div, .stMarkdown, .stText {
        color: #212529 !important;
    }

    /* 스테퍼 디자인 */
    .stepper-container {
        display: flex;
        justify-content: center;
        align-items: center;
        margin: 3rem 0;
        gap: 0;
    }
    .step {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 150px;
    }
    .step-circle {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background-color: #ffffff;
        color: #adb5bd;
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 0.9rem;
        font-weight: 700;
        margin-bottom: 0.75rem;
        transition: all 0.3s ease;
        border: 2px solid #f1f3f5;
    }
    .step-circle.active {
        background-color: #ffffff;
        color: #4c6ef5;
        border-color: #4c6ef5;
    }
    .step-label {
        font-size: 0.85rem;
        color: #adb5bd !important;
        font-weight: 500;
    }
    .step-label.active {
        color: #212529 !important;
        font-weight: 700;
    }
    .step-line {
        height: 1px;
        width: 80px;
        background-color: #f1f3f5;
        margin-bottom: 2rem;
    }

    /* 상태 박스 */
    .status-box {
        background-color: #ffffff;
        padding: 1rem;
        border-radius: 10px;
        border: 1px solid #f1f3f5;
        text-align: center;
        margin-bottom: 2rem;
        color: #212529;
    }

    /* 익스팬더 & 위젯 배경 (옅은 회색으로 강제 통일) */
    .stExpander, [data-testid="stExpander"] {
        background-color: #f8f9fa !important;
        border: 1px solid #f1f3f5 !important;
        border-radius: 10px !important;
    }
    .stExpander summary {
        background-color: #f8f9fa !important;
        color: #212529 !important;
    }
    
    /* 입력 필드 (배경 옅은 회색, 글씨색 통일) */
    .stSelectbox div[data-baseweb="select"], 
    .stTextArea textarea,
    [data-baseweb="popover"], [data-baseweb="menu"] {
        background-color: #f1f3f5 !important;
        background: #f1f3f5 !important;
        border: 1px solid #e9ecef !important;
        border-radius: 8px !important;
        color: #212529 !important;
    }
    
    /* 셀렉트박스 내부 옵션 리스트가 검정으로 나오는 것 방지 */
    [data-baseweb="menu"] li {
        background-color: #f1f3f5 !important;
        color: #212529 !important;
    }
    [data-baseweb="menu"] li:hover {
        background-color: #e9ecef !important;
    }
    
    /* 파일 업로드 영역 */
    [data-testid="stFileUploader"] {
        background-color: #ffffff !important;
        border: 1px solid #f1f3f5 !important;
        border-radius: 12px;
        padding: 50px 30px !important;
        transition: all 0.3s ease;
    }
    [data-testid="stFileUploader"] section {
        background-color: transparent !important;
    }
    
    /* 버튼 스타일 */
    .stButton>button {
        border-radius: 6px;
        font-weight: 600;
        border: 1px solid #e9ecef;
    }
    
    /* 제목 폰트 굵기 */
    h1, h2, h3 {
        color: #212529 !important;
        font-weight: 800 !important;
    }
</style>
""", unsafe_allow_html=True)

# 헤더
st.markdown("""
<div class="header-container">
    <div class="header-title">
        어휘왕 OCR 채점기
    </div>
    <div style="color: #adb5bd; font-size: 0.8rem; font-weight: 500;">
        Powered by Gemini 3.0
    </div>
</div>
""", unsafe_allow_html=True)

# 세션 상태 초기화
if "processed_files" not in st.session_state:
    st.session_state.processed_files = []
if "grading_results" not in st.session_state:
    st.session_state.grading_results = []
if "api_key_configured" not in st.session_state:
    st.session_state.api_key_configured = False
if "current_step" not in st.session_state:
    st.session_state.current_step = 1

def main():
    # 스테퍼 (비주얼용)
    step1_class = "active" if st.session_state.current_step == 1 else ""
    step2_class = "active" if st.session_state.current_step == 2 else ""
    step3_class = "active" if st.session_state.current_step == 3 else ""

    st.markdown(f"""
    <div class="stepper-container">
        <div class="step">
            <div class="step-circle {step1_class}">1</div>
            <div class="step-label {step1_class}">정답지 설정</div>
        </div>
        <div class="step-line"></div>
        <div class="step">
            <div class="step-circle {step2_class}">2</div>
            <div class="step-label {step2_class}">학생 답안 업로드</div>
        </div>
        <div class="step-line"></div>
        <div class="step">
            <div class="step-circle {step3_class}">3</div>
            <div class="step-label {step3_class}">채점 결과</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    # Secrets에서 API 키 자동 시도
    api_key = st.secrets.get("GEMINI_API_KEY")
    if api_key:
        genai.configure(api_key=api_key)
        st.session_state.api_key_configured = True

    if not st.session_state.api_key_configured:
        st.error("설정된 Gemini API Key가 없습니다. Secrets에 GEMINI_API_KEY를 등록해주세요.")
        return

    # 탭 구조 (실제 기능 분리)
    tab1, tab2, tab3 = st.tabs(["1단계 정답지", "2단계 학생 답안", "3단계 결과"])

    # --- 1단계: 정답지 설정 ---
    with tab1:
        st.session_state.current_step = 1
        
        # 상태 박스
        ref_status = "선택된 정답지가 없습니다."
        if st.session_state.get('ref_file_name'):
            ref_status = f"현재 등록된 정답지: {st.session_state['ref_file_name']}"
        st.markdown(f'<div class="status-box">{ref_status}</div>', unsafe_allow_html=True)

        # 고급 설정 익스팬더
        with st.expander("고급 설정 (Advanced)", expanded=False):
            model_options = {
                "Gemini 3.0 Flash (빠름)": "gemini-2.0-flash-exp",
                "Gemini 3.0 Pro (정밀)": "gemini-2.0-pro-exp"
            }
            selected_model_label = st.selectbox(
                "AI 모델 (MODEL)",
                options=list(model_options.keys()),
                index=0
            )
            model_name = model_options[selected_model_label]
            
            ocr_rules = st.text_area(
                "OCR 규칙",
                placeholder='예: "V" 체크표시만 정답으로 인정합니다.',
                help="채점 시 AI가 참고할 특별한 규칙을 입력하세요."
            )

        st.subheader("정답지 업로드")
        st.write("채점 기준이 될 정답지나 모범 답안(PDF 또는 이미지)을 업로드해주세요.")
        
        reference_file = st.file_uploader(
            "정답지 파일 드래그 & 드롭",
            type=["pdf", "png", "jpg", "jpeg"],
            key="ref_file_uploader",
            label_visibility="collapsed"
        )
        
        if reference_file:
            ref_path = utils.save_uploaded_file(reference_file)
            st.session_state['ref_file_path'] = ref_path
            st.session_state['ref_file_name'] = reference_file.name
            st.success(f"정답지 등록 완료: {reference_file.name}")

    # --- 2단계: 학생 답안 제출 ---
    with tab2:
        st.session_state.current_step = 2
        st.subheader("학생 답안지 업로드")
        
        student_files = st.file_uploader(
            "학생 답안 파일들 (여러 개 가능)",
            type=["pdf", "png", "jpg", "jpeg"],
            accept_multiple_files=True,
            key="student_files_uploader"
        )
        if student_files:
            st.info(f"총 {len(student_files)}개의 답안지가 준비되었습니다.")

    # --- 3단계: 채점 및 결과 ---
    with tab3:
        st.session_state.current_step = 3
        st.subheader("채점 및 결과")
        
        if st.button("채점 시작", type="primary"):
            if not st.session_state.get('ref_file_path'):
                 st.error("먼저 1단계에서 정답지를 등록해주세요.")
                 return
            
            if not student_files:
                 st.error("채점할 학생 답안 파일이 없습니다.")
                 return

            st.write("채점 진행 중...")
            progress_bar = st.progress(0)
            status_text = st.empty()
            
            results = []
            grader = GraderAI(api_key=api_key, model_name=model_name)
            
            # 정답지 업로드
            try:
                ref_file_obj = grader.upload_file(st.session_state['ref_file_path'])
            except Exception as e:
                st.error(f"정답지 처리 실패: {e}")
                return

            total_files = len(student_files)
            for idx, s_file in enumerate(student_files):
                status_text.text(f"채점 중: {s_file.name} ({idx+1}/{total_files})")
                s_file_path = utils.save_uploaded_file(s_file)
                try:
                    student_file_obj = grader.upload_file(s_file_path)
                    result = grader.grade_submission(ref_file_obj, student_file_obj, ocr_rules=ocr_rules)
                    result['file_name'] = s_file.name
                    results.append(result)
                except Exception as e:
                    results.append({"student_name": "오류", "file_name": s_file.name, "total_score": 0, "feedback": str(e)})
                finally:
                    if os.path.exists(s_file_path): os.unlink(s_file_path)
                
                progress_bar.progress((idx + 1) / total_files)
                time.sleep(1)

            st.session_state.grading_results = results
            st.success("모든 채점이 완료되었습니다.")

        if st.session_state.grading_results:
            df = pd.DataFrame(st.session_state.grading_results)
            st.dataframe(df[["student_name", "total_score", "feedback", "file_name"]])
            
            # Google Sheets 내보내기 폼
            with st.expander("결과 내보내기", expanded=False):
                sheet_url = st.text_input("Google Sheet URL")
                service_account = st.file_uploader("Service Account JSON (내보내기용)", type=["json"])
                
                if st.button("시트로 내보내기"):
                    if not sheet_url or not service_account:
                        st.error("URL과 JSON 파일을 모두 제공해주세요.")
                    else:
                        try:
                            sa_path = utils.save_uploaded_file(service_account)
                            sheet = utils.connect_to_sheet(sa_path, sheet_url).get_worksheet(0)
                            for res in st.session_state.grading_results:
                                utils.append_to_sheet(sheet, res)
                            st.success("Google 시트 저장이 완료되었습니다.")
                        except Exception as e:
                            st.error(f"저장 실패: {e}")

if __name__ == "__main__":
    main()
