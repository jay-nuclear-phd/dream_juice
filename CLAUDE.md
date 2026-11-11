# 드림주스 주식스터디 슬라이드

노션에서 HTML로 export한 강의 페이지를 PPT처럼 한 장씩 넘겨 보는 정적 사이트로 만든 저장소.
GitHub Pages(`main` 브랜치, `/ (root)`)로 호스팅한다.

- 사이트: https://jay-nuclear-phd.github.io/dream_juice/
- 저장소: https://github.com/jay-nuclear-phd/dream_juice
- 빌드 도구 없음. 순수 HTML/CSS/JS이며 푸시하면 1~2분 뒤 반영된다.
- 사용자와의 대화와 화면 문구는 한국어로 한다.

## 폴더 구조

```
index.html            첫 화면(강의 목록 허브)
assets/deck.css       모든 강의가 함께 쓰는 슬라이드 스타일
assets/deck.js        슬라이드 엔진(넘기기, 편집, 포인터/펜)
assets/banner.jpg     드림주스 배너(각 강의 표지에서 사용)
assets/juice.png      배너에서 주스·사과 그림만 따낸 투명 PNG(첫 화면 헤더)
lecture1/ lecture2/ lecture4/ lecture5/
  index.html          강의별 슬라이드(1강 36장, 2강 31장, 4강 20장, 5강 26장)
  img/                그 강의에서 쓰는 이미지(ASCII 파일명)
1강/ 2강/ 4강/ 5강/    노션 export 원본. 읽기 전용 자료이므로 수정하지 않는다
.nojekyll             GitHub Pages의 Jekyll 처리 끄기
```

- 3강은 사용자가 삭제했으므로 만들지 않는다.
- 원본 이미지는 한글(NFD) 파일명이라 문제가 생기기 쉽다. 그래서 `lectureN/img/`에 영문 파일명으로 복사해서 쓴다.
- 링크는 `lecture1/index.html`처럼 파일을 직접 가리킨다. 폴더(`lecture1/`)를 가리키면 로컬에서 파일로 열 때 디렉터리 목록이 보인다.

## 슬라이드 HTML 규칙

- `<body data-deck="lectureN">`의 값은 localStorage 키에 쓰인다.
- 구조는 `.deck > .stage > section.slide` 이다. 마지막에 `<script src="../assets/deck.js">`를 넣는다.
- 무대 크기는 1280×720 논리 좌표다. `--k` 변수와 `transform: scale`로 화면에 맞춘다. 내용이 무대 밖으로 넘치면 안 된다.
- 엔진은 슬라이드의 직계 자식 하나하나를 편집 가능한 "개체"로 본다.
  - `class="layout"`인 요소는 투명한 묶음으로 취급하고, 그 자식들을 개체로 본다.
  - `.bg`(배경)는 개체에서 제외한다.
- 표지는 `.cover`/`.cover-banner`, 구간 표지는 `.section`, 페이지 번호를 숨길 때는 `.no-num`을 쓴다.
- 자주 쓰는 컴포넌트(`deck.css`):
  - 글 꾸밈: `.kicker` `.lead` `.muted` `.hl-red` `.hl-blue` `.mark` `.quote` `.big-statement` `.formula` `.stat` `.w5h` `.lbl`
  - 목록·카드: `.rows/.row/.num` `.cards.c2/.c3/.card` `.bullets` `.checks` `.callout` `.flow/.arrow/.solution`
  - 표: `.tbl`(`.compact` `.small` `.tiny`)
  - 배치·이미지: `.two`(`.wide-left`) `.figs` `.fig-img` `.stack` `.timeline`
  - 기타: `.linkcard`(외부 링크 카드) `.books`/`.booklist`
- 내용은 노션 원문을 그대로 옮긴다. 제목이나 개요 장을 새로 붙일 때는 사용자에게 알린다.
- 노션 페이지로 가는 링크는 넣지 않는다(사용자 요청으로 삭제함).
- 5강 장단기 금리차 차트는 FRED에서 실시간으로 불러오는 이미지다(인터넷 필요).

## deck.js 기능

**발표**
- 키보드: ←/→, Space, PageUp/PageDown, Home/End.
- 화면 클릭: 오른쪽 65%는 다음, 왼쪽은 이전. 터치 스와이프도 된다.
- 주소 끝 `#번호`로 특정 슬라이드를 연다.
- 단축키: F 전체화면, H 또는 **목록** 버튼은 첫 화면(`../index.html`), ? 도움말.
- 툴바는 마우스가 2.5초 멈추면 숨겨진다.

**편집**(E 또는 `?edit` 쿼리)
- 클릭은 선택, 드래그는 이동, 위쪽 동그라미는 회전(Shift를 누르면 15° 단위), 오른쪽 아래 네모는 크기 조절이다.
- 더블클릭 또는 Enter로 글자를 고친다. 붙여넣기는 서식 없이 글자만 들어간다.
- 방향키로 1px씩(Shift를 누르면 10px씩) 움직이고, Ctrl+Z로 되돌린다.
- 변경 내용은 `translate() rotate() scale()`과 `data-x/y/r/s`로 기록된다.
- 저장 위치는 localStorage의 `deck-edits:<deck>` 키다.
  - 원본 무대 HTML의 해시를 함께 저장한다. 원본 파일이 바뀌면 예전 로컬 편집은 버린다.
- **편집은 GitHub에 자동 반영되지 않는다.** 모두에게 보이게 하는 순서:
  1. **HTML 저장**으로 정리된 `index.html`을 받는다.
  2. 그 파일로 `lectureN/index.html`을 덮어쓴다.
  3. 커밋하고 푸시한다.
- 사용자가 받은 파일을 주면 해당 강의 위치에 옮긴 뒤 커밋·푸시하면 된다.

**가리키기·그리기**(발표 모드 전용, 편집 모드를 켜면 꺼진다)
- L 포인터: 빛나는 레이저 점이 따라다닌다. 클릭으로 넘기기는 그대로 된다.
- K 레이저펜: 그린 선이 마지막 획을 뗀 뒤 약 1.5초 지나 사라진다.
- P 펜: 그린 선이 남는다.
  - localStorage의 `deck-ink:<deck>` 키에 슬라이드별로 저장된다.
  - HTML 저장으로 내보내는 파일에는 들어가지 않는다.
- 색은 빨강·노랑·초록·파랑·검정 5가지다.
- C는 현재 슬라이드의 펜 자국 지우기, Ctrl+Z는 마지막 획 지우기, Esc는 도구 끄기다.
- 레이저펜이나 펜을 켠 동안 화면 클릭은 넘기지 않고 그리기로만 쓰인다.
- 도구를 켠 동안 툴바는 마우스가 화면 아래쪽에 있을 때만 나타난다.
- 각 슬라이드에 `svg.ink-layer`(viewBox 1280×720)가 붙는다. 무대와 함께 확대·축소되어 위치가 어긋나지 않는다.

## 고칠 때 주의할 점(겪었던 버그)

- `.slide > :not(.bg):not(.obj-overlay):not(.ink-layer)`가 `position: relative; z-index: 1`을 준다.
  - 슬라이드에 새로 넣는 절대 위치 레이어는 여기서 제외해야 한다. 그렇지 않으면 위치가 깨진다.
  - `.layout > *`도 z-index 1이 필요하다. 없으면 `.bg` 밑에 깔려 보이지 않는다.
- `setPointerCapture`는 드래그가 3px 이상 움직인 뒤에 건다. 누르자마자 걸면 dblclick이 개체에 전달되지 않는다.
- 선택한 개체는 `z-index: 30`으로 올린다. 그래야 옮겼을 때 다른 개체 밑에 가려지지 않는다.
- `data-s`는 소수 3자리로 반올림한다. 1자리로 하면 실제 transform과 어긋난다.
- 툴바 버튼 클릭은 `actions[act](button)`으로 호출된다. 버튼 정보(`data-tool`, `data-c`)는 이 인자로 받는다.
- 첫 화면 `main.wrap`: `.wrap`의 `margin`/`padding` 축약 속성이 `main` 규칙을 덮어쓴다. 여백은 `main.wrap` 선택자로 준다.
- 휴대폰 화면 캡처처럼 세로로 긴 이미지는 `grid-template-columns: 1fr auto`와 높이 제한을 함께 써야 한다. 그래야 오른쪽으로 넘치지 않는다.

## 확인 방법

- 로컬 서버: `python3 -m http.server 8765` → `http://localhost:8765/`
- Playwright로 확인할 것:
  - 1280×720에서 모든 슬라이드에 넘침이 없는지, 깨진 이미지가 없는지
  - 편집, 그리기 기능
  - 390px 폭(휴대폰) 화면
- 스크린샷은 `.playwright-mcp/`에 저장하고(gitignore에 들어 있다), 다 쓰면 지운다.
- 배포 확인: `gh api repos/jay-nuclear-phd/dream_juice/pages/builds/latest`
- 커밋과 푸시는 사용자가 요청할 때만 한다.
