# server.py (또는 bridge.py)
from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
import datetime
import os  # 환경 변수를 읽기 위해 추가

app = Flask(__name__)
CORS(app) # HTML에서 파이썬 서버로 데이터를 보낼 수 있게 허용

# ⚠️ 보안 적용: JSON 파일 이름을 직접 하드코딩하지 않고 환경 변수에서 가져옵니다.
# GitHub Actions에서는 'FIREBASE_KEY_PATH'를 사용하고, 
# 로컬에서는 기존 파일명('bloodborne-b1aae...')을 기본값으로 사용해 오류를 방지합니다.
CREDENTIAL_FILE = os.environ.get('FIREBASE_KEY_PATH', 'bloodborne-b1aae-firebase-adminsdk-fbsvc-aeb1b24d69.json')

# Firebase Admin SDK 초기화
try:
    cred = credentials.Certificate(CREDENTIAL_FILE)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("✅ Firebase 연동 성공!")
except Exception as e:
    print(f"❌ Firebase 연동 실패: {e}")

@app.route('/save_stats', methods=['POST'])
def save_stats():
    try:
        # HTML에서 보낸 통계 데이터 받기
        data = request.json
        
        # Firestore에 저장할 데이터 구성
        doc_data = {
            "clearTime": data.get("clearTime"),
            "totalAttempted": data.get("totalAttempted"),
            "correctAnswers": data.get("correctAnswers"),
            "wrongQuestions": data.get("wrongQuestions"),
            "timestamp": datetime.datetime.now() # 서버 시간 기준
        }
        
        # 'game_clears' 컬렉션에 데이터 추가
        db.collection('game_clears').add(doc_data)
        
        print(f"📊 게임 결과 저장 완료: {data.get('clearTime')}초 클리어")
        return jsonify({"status": "success", "message": "Firebase 저장 완료"}), 200

    except Exception as e:
        print(f"❌ 에러 발생: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    print("🚀 로컬 게임 서버가 실행되었습니다. (http://localhost:5000)")
    app.run(port=5000)
