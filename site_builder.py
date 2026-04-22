"""
트립픽 사이트 자동 빌더
========================
auto_post.py가 글을 발행한 뒤 호출되어:
  1. posts/{slug}.html  — 개별 글 페이지 생성
  2. assets/thumbnails/ — SVG 썸네일 복사
  3. index.html         — POSTS 데이터 자동 주입 (홈 카드 목록 갱신)
  4. git commit + push  — GitHub → Netlify 자동 배포
"""
import os
import re
import json
import shutil
import subprocess
from datetime import datetime

_BASE        = os.path.dirname(os.path.abspath(__file__))
_TISTORY     = os.path.join(_BASE, "..", "tistory")
_LOG_FILE    = os.path.join(_TISTORY, "post_log.json")
_INDEX       = os.path.join(_BASE, "index.html")
_REMOTE_URL  = "https://github.com/AidenYS/onzib.git"   # Netlify 연동 저장소


def _slugify(title: str) -> str:
    """제목 → URL 슬러그"""
    title = re.sub(r"[^\w\s가-힣]", "", title)
    title = re.sub(r"\s+", "-", title.strip())
    return title[:60]


def _post_page_html(title: str, city: str, fmt: str,
                    body_html: str, thumbnail_rel: str, date: str) -> str:
    """개별 포스트 HTML 페이지"""
    format_label = {
        "ranking": "🏆 랭킹", "hotel": "🏨 호텔", "course": "🗺️ 코스",
        "deepdive": "🔍 심층분석", "theme": "🎯 테마", "compare": "⚖️ 비교"
    }.get(fmt, "✈️ 여행")

    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} | 트립픽</title>
  <meta name="description" content="{city} 여행 정보 — {title}">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: 'Noto Sans KR', sans-serif; background: #f8f8f6; color: #222; line-height: 1.8; }}
    header {{ background: #fff; border-bottom: 1px solid #eee; position: sticky; top: 0; z-index: 100; }}
    .header-inner {{ max-width: 860px; margin: 0 auto; padding: 0 24px; display: flex; align-items: center; justify-content: space-between; height: 64px; }}
    .logo {{ font-size: 22px; font-weight: 900; color: #c0392b; text-decoration: none; }}
    .logo span {{ color: #222; }}
    nav a {{ font-size: 15px; color: #555; text-decoration: none; margin-left: 24px; }}
    nav a:hover {{ color: #c0392b; }}
    .post-wrap {{ max-width: 760px; margin: 48px auto 80px; padding: 0 24px; }}
    .post-meta {{ display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }}
    .badge {{ background: #c0392b; color: #fff; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 14px; }}
    .city-tag {{ color: #c0392b; font-size: 14px; font-weight: 700; }}
    .post-date {{ color: #aaa; font-size: 13px; }}
    .post-title {{ font-size: 34px; font-weight: 900; line-height: 1.3; margin-bottom: 32px; }}
    .thumb-wrap {{ margin-bottom: 36px; border-radius: 14px; overflow: hidden; }}
    .thumb-wrap img, .thumb-wrap svg {{ width: 100%; display: block; }}
    .post-body {{ background: #fff; border-radius: 14px; padding: 40px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }}
    footer {{ background: #1a1a1a; color: rgba(255,255,255,0.5); text-align: center; padding: 40px 24px; font-size: 13px; line-height: 2; }}
    footer a {{ color: rgba(255,255,255,0.5); text-decoration: none; }}
    footer strong {{ color: rgba(255,255,255,0.8); }}
    @media (max-width: 600px) {{ .post-body {{ padding: 24px; }} .post-title {{ font-size: 24px; }} }}
  </style>
</head>
<body>
<header>
  <div class="header-inner">
    <a href="../index.html" class="logo">트립<span>픽</span></a>
    <nav><a href="../index.html">← 목록으로</a></nav>
  </div>
</header>

<div class="post-wrap">
  <div class="post-meta">
    <span class="badge">{format_label}</span>
    <span class="city-tag">{city}</span>
    <span class="post-date">{date}</span>
  </div>
  <h1 class="post-title">{title}</h1>

  {'<div class="thumb-wrap"><img src="../' + thumbnail_rel + '" alt="' + title + '"></div>' if thumbnail_rel else ''}

  <div class="post-body">
    {body_html}
  </div>
</div>

<footer>
  <strong>트립픽 TripPick</strong><br>
  마이리얼트립 공식 마케팅 파트너 · 실제 리뷰 기반 국내 여행 추천<br>
  본 사이트의 링크를 통해 구매 시 수수료를 지급받습니다. (공정거래위원회 고시 준수)<br><br>
  <a href="../index.html">홈으로</a>
</footer>
</body>
</html>"""


def _update_index(posts_data: list):
    """index.html의 POSTS 배열 자동 갱신"""
    with open(_INDEX, encoding="utf-8") as f:
        html = f.read()

    posts_js = json.dumps(posts_data, ensure_ascii=False, indent=2)
    new_line  = f"  const POSTS = {posts_js};"
    html = re.sub(r"const POSTS = \[.*?\];", new_line, html, flags=re.DOTALL)

    # 추천 글 수 업데이트
    count = len(posts_data)

    with open(_INDEX, "w", encoding="utf-8") as f:
        f.write(html)


def _git_push(commit_msg: str):
    """
    myweb/ 폴더를 GitHub에 자동 push.
    - 저장소가 아직 초기화되지 않았으면 자동으로 init → remote 추가
    - .gitignore에 __pycache__ 등 제외
    """
    git = ["git", "-C", _BASE]

    # 초기화 여부 확인
    result = subprocess.run(git + ["rev-parse", "--is-inside-work-tree"],
                            capture_output=True, text=True)
    if result.returncode != 0:
        # 최초 1회: init + remote 설정
        subprocess.run(git + ["init"], check=True)
        subprocess.run(git + ["remote", "add", "origin", _REMOTE_URL], check=True)
        # .gitignore 생성
        gitignore = os.path.join(_BASE, ".gitignore")
        if not os.path.exists(gitignore):
            with open(gitignore, "w") as f:
                f.write("__pycache__/\n*.py[cod]\n*.pyc\n.DS_Store\n")
        subprocess.run(git + ["branch", "-M", "main"], capture_output=True)

    # remote URL 최신화 (URL 변경 대비)
    subprocess.run(git + ["remote", "set-url", "origin", _REMOTE_URL],
                   capture_output=True)

    # 변경 파일 스테이징 → 커밋 → 푸시
    subprocess.run(git + ["add", "-A"], check=True)
    commit_result = subprocess.run(
        git + ["commit", "-m", commit_msg],
        capture_output=True, text=True
    )
    if "nothing to commit" in commit_result.stdout:
        print("  [Git] 변경사항 없음, push 생략")
        return

    push_result = subprocess.run(
        git + ["push", "-u", "origin", "main"],
        capture_output=True, text=True
    )
    if push_result.returncode == 0:
        print(f"  [Git] push 완료 → Netlify 자동 배포 시작")
    else:
        # HTTPS 인증 실패 등 → 메시지만 출력, 에러 raise 안 함
        print(f"  [Git] push 실패 (인증 문제일 수 있음):")
        print("  " + (push_result.stderr or push_result.stdout)[:300])


def build_post(title: str, city: str, fmt: str,
               body_html: str, date: str = None, auto_push: bool = True) -> str:
    """
    새 글을 myweb에 추가.

    Args:
        title:     글 제목
        city:      도시
        fmt:       포맷 (ranking/hotel/course 등)
        body_html: claude_writer가 생성한 HTML 본문
        date:      날짜 문자열 (None이면 오늘)

    Returns:
        str: 생성된 포스트 파일 경로
    """
    date = date or datetime.now().strftime("%Y.%m.%d")
    slug = _slugify(title)

    # ── 썸네일 SVG 복사
    thumb_src = os.path.join(_TISTORY, "thumbnail.svg")
    thumb_dst = os.path.join(_BASE, "assets", "thumbnails", f"{slug}.svg")
    thumbnail_rel = ""
    if os.path.exists(thumb_src):
        shutil.copy2(thumb_src, thumb_dst)
        thumbnail_rel = f"assets/thumbnails/{slug}.svg"

    # ── 개별 포스트 페이지 생성
    post_html = _post_page_html(title, city, fmt, body_html, thumbnail_rel, date)
    post_path = os.path.join(_BASE, "posts", f"{slug}.html")
    with open(post_path, "w", encoding="utf-8") as f:
        f.write(post_html)

    # ── 포스트 목록 로드 & 갱신
    posts_json = os.path.join(_BASE, "posts_data.json")
    if os.path.exists(posts_json):
        with open(posts_json, encoding="utf-8") as f:
            all_posts = json.load(f)
    else:
        all_posts = []

    # 중복 방지
    all_posts = [p for p in all_posts if p["slug"] != slug]
    all_posts.insert(0, {
        "slug":      slug,
        "title":     title,
        "city":      city,
        "format":    fmt,
        "date":      date,
        "thumbnail": thumbnail_rel,
    })

    with open(posts_json, "w", encoding="utf-8") as f:
        json.dump(all_posts, f, ensure_ascii=False, indent=2)

    _update_index(all_posts)

    print(f"  [트립픽] 글 생성 완료: posts/{slug}.html")

    # GitHub push → Netlify 자동 배포
    if auto_push:
        try:
            _git_push(f"post: {title[:60]}")
        except Exception as e:
            print(f"  [Git] push 중 오류: {e}")

    return post_path


if __name__ == "__main__":
    # 테스트: 현재 generated_post.html로 빌드
    post_html_path = os.path.join(_TISTORY, "generated_post.html")
    if os.path.exists(post_html_path):
        with open(post_html_path, encoding="utf-8") as f:
            content = f.read()
        # <title> 태그에서 제목 추출
        m = re.search(r"<title>(.*?)\s*\|?\s*(?:트립픽)?</title>", content)
        title = m.group(1) if m else "속초 씨마크 호텔 완벽 가이드"
        build_post(
            title=title,
            city="속초",
            fmt="hotel",
            body_html=content,
        )
        print("✅ 테스트 빌드 완료")
    else:
        print("generated_post.html 없음")
