#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Wire $SOUND token debits into core monetized actions per the new pricing tier:
  Upload Music = 1 $SOUND, AI Album Cover = 2 $SOUND, Go Live = 3 $SOUND.
  Pro subscribers get unlimited Upload + AI Album. Insufficient-balance should show
  a friendly Top-up flow that deep-links to /store.

backend:
  - task: "POST /api/iap/spend deducts correct cost per action and 402s on insufficient balance"
    implemented: true
    working: "NA"
    file: "backend/routes/iap.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Endpoint already existed. Confirmed TOKEN_COSTS = upload_music:1, ai_album_cover:2, go_live:3. Pro users free for upload_music + ai_album_cover."
  - task: "POST /api/me/tracks no longer auto-rewards +20 $SOUND (cost is paid via /iap/spend)"
    implemented: true
    working: "NA"
    file: "backend/routes/tracks.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Set TRACK_REWARD_BASE = 0 and skip credit_tokens call when reward is 0. Response still returns balance and sound_awarded:0."
  - task: "POST /api/albums charges 2 $SOUND (was 3)"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Updated ACTION_COSTS.publish_album from 3 -> 2 so album creation pre-debits 2 tokens via debit_tokens."

frontend:
  - task: "Studio Upload pre-charges 1 $SOUND via /iap/spend before publishing"
    implemented: true
    working: "NA"
    file: "frontend/app/studio/upload.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Calls spendOr('upload_music') before api.uploadTrack. On 402 (insufficient) shows alert with 'Top up' → router.push('/store'). Button copy updated to 'Publish · 1 $SOUND'."
  - task: "Studio Record pre-charges 1 $SOUND via /iap/spend before saving recording"
    implemented: true
    working: "NA"
    file: "frontend/app/studio/record.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Same spendOr('upload_music') flow as upload. Updated copy and removed +20 reward language."
  - task: "/live screen pre-charges 3 $SOUND, then shows live-room stub (Agora pending)"
    implemented: true
    working: "NA"
    file: "frontend/app/live/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "New screen. Pre-go-live preview → spendOr('go_live') → live-room with red LIVE pill, viewer/chat/tip counters, End Stream button. Pro users see 'Free'."
  - task: "Studio tab adds Go Live tile and updates token-cost copy on tiles"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/studio.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Record/Upload tiles updated from '+20 $SOUND' to 'costs 1 $SOUND'. Added 'Go Live · costs 3 $SOUND' tile. Album tile copy updated to '2 $SOUND'."
  - task: "Insufficient-balance alert deep links to /store"
    implemented: true
    working: "NA"
    file: "frontend/src/utils/spend.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "spendOr helper: catches the 402 'Not enough $SOUND' error and shows Cancel/Top up alert that navigates to /store."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "POST /api/iap/spend deducts correct cost per action and 402s on insufficient balance"
    - "POST /api/me/tracks no longer auto-rewards +20 $SOUND (cost is paid via /iap/spend)"
    - "POST /api/albums charges 2 $SOUND (was 3)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Wired token debits for the new monetization model.
      Backend: tracks.py reward set to 0; ACTION_COSTS.publish_album lowered to 2; /api/iap/spend already supports upload_music/ai_album_cover/go_live.
      Frontend: spend helper at src/utils/spend.ts catches 402 and prompts "Top up" → /store. Studio Upload + Studio Record + new /live screen all call spendOr() before the paid action. Studio tab tile copy updated. Album generator tile + screen copy updated 3→2.
      Please test BACKEND only first:
        1) POST /api/iap/spend with action=upload_music (1), ai_album_cover (2), go_live (3) — verify cost, balance reduction, and idempotent ledger entry in db.token_ledger.
        2) Insufficient balance → 402 with detail "Not enough $SOUND (need N)".
        3) Active Pro subscription → upload_music and ai_album_cover return cost:0, pro:true.
        4) Unknown action → 400.
        5) POST /api/me/tracks → response has sound_awarded:0 and a real balance.
        6) POST /api/albums charges 2 (not 3) — check balance delta.
      Use /app/memory/test_credentials.md for demo user (demo@soundmesh.app / Demo12345). Top up balance via direct DB or /iap/validate sandbox if needed.
