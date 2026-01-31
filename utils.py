import gspread
from google.oauth2.service_account import Credentials
import pandas as pd
import tempfile
import os

def save_uploaded_file(uploaded_file):
    """Streamlit UploadedFile 객체를 임시 경로에 저장하고 경로를 반환합니다."""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{uploaded_file.type.split('/')[-1]}") as tmp_file:
            tmp_file.write(uploaded_file.getvalue())
            return tmp_file.name
    except Exception as e:
        raise RuntimeError(f"파일 저장 실패: {e}")

def connect_to_sheet(service_account_json_path: str, spreadsheet_url: str = None):
    """Google Sheets API 연결 설정"""
    scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
    creds = Credentials.from_service_account_file(service_account_json_path, scopes=scope)
    client = gspread.authorize(creds)
    
    if spreadsheet_url:
        return client.open_by_url(spreadsheet_url)
    return client

def append_to_sheet(sheet, data: dict):
    """채점 결과를 시트에 한 행으로 추가"""
    # 헤더가 없으면 생성 로직이 필요할 수 있으나, 여기선 단순 추가
    row = [
        data.get("student_name", "Unknown"),
        data.get("total_score", 0),
        data.get("feedback", ""),
        str(data.get("scores", [])) # 상세 점수는 문자열로 변환하여 저장
    ]
    sheet.append_row(row)
