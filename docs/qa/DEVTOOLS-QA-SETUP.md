# Browser DevTools Setup for FeesExpensesStep QA

**Purpose**: Optimize browser DevTools layout and settings for efficient manual QA of auto-save feature

**Target Browsers**: Chrome, Firefox, Edge, Safari
**Time to Setup**: 2-3 minutes

---

## CHROME / EDGE DevTools Setup

### Panel Layout Configuration

1. **Open DevTools** (F12 or Right-click > Inspect Element)

2. **Arrange Panels** for side-by-side testing:
   ```
   Main viewport (40% width):  Your application
   DevTools (60% width):       Network + Console tabs
   ```

   To enable side-by-side:
   - Click DevTools menu (three dots)
   - Dock side > Select "Right" or "Bottom"
   - Recommend "Right" for better Network tab visibility

### Network Tab Configuration

**Tab Name**: Network
**Recommended Filters**: POST, PATCH

Setup:
1. Click "Network" tab in DevTools
2. Ensure network recording is ON (red circle at top-left)
3. Click "Filter" icon (funnel shape)
4. Filter type: Select "XHR/Fetch" (will show only API calls)
5. In the filter search box, type: `POST|PATCH` (regex)

**What to Observe**:
- Request timing (when does it fire after keystroke)
- Request payload (what data is being sent)
- Response status (200 = success, 4xx/5xx = error)
- Response body (what the server returned)

**Key Metrics**:
- Time until request fires: Should be ~750ms after last keystroke
- Request count: Should be 1 per debounce cycle (not multiple)
- Payload content: Verify correct field values being sent

### Console Tab Configuration

**Tab Name**: Console
**Default Level**: Filter to "Errors" initially

Setup:
1. Click "Console" tab in DevTools
2. At top, click the filter dropdown
3. Select "Error" only (to reduce noise)
4. This will show validation errors and exceptions

**What to Observe**:
- Validation error messages when invalid data entered
- React/JavaScript errors (if any)
- Performance timing logs (if component logs them)

**Expected Output Examples**:
```
Valid entry: No console output (clean)
Invalid entry "10" in Rate field:
  → "Must be between 0 and 5" (Zod validation error)
```

### Performance Tab (Optional, for Debounce Timing)

**Tab Name**: Performance
**Use Case**: Verify 750ms debounce accuracy

Setup:
1. Click "Performance" tab
2. Click red "Record" button
3. Type "2.5" in Rate field
4. Wait for network request to fire
5. Click red "Record" button again to stop
6. Analyze the timeline

**What to Look For**:
- Keystroke event at time T
- Debounce timer set at T
- Network request at T + 750ms (±50ms acceptable)

**Interpretation**:
```
Timeline:
0ms:    Keystroke registered
750ms:  Network request fires
```

Expected deviation: ±50ms (reasonable for JavaScript event loop)

### Memory Tab (Optional, for Memory Leak Detection)

**Tab Name**: Memory
**Use Case**: Verify no memory leaks during repeated cycles

Setup:
1. Click "Memory" tab
2. Select "Heap snapshots" option
3. Click "Take snapshot" (camera icon)
4. Note the heap size in MB
5. Perform test cycle 10x:
   - Type value
   - Wait for save
   - Navigate away
   - Navigate back
6. Take another snapshot
7. Compare sizes

**What to Look For**:
- Stable memory (no unbounded growth)
- Acceptable growth: <10% increase
- Unacceptable: Doubling or continuous growth each cycle

**Example**:
```
Baseline snapshot:  42 MB
After 10 cycles:    45 MB (7% growth) <- GOOD
After 10 cycles:    84 MB (100% growth) <- BAD (memory leak)
```

---

## FIREFOX DevTools Setup

### Basic Panel Configuration

1. **Open DevTools** (F12 or Right-click > Inspect Element)

2. **Arrange Panels**:
   - Inspector tab visible
   - DevTools on right side (Settings > Inspector > Position: Right)

### Network Tab

1. Click "Network" tab
2. Ensure recording is ON (should auto-start)
3. Clear filters (show all requests)
4. Watch for POST/PATCH requests to `/api/modeling-wizard`

**Unique Firefox Feature**: Request timeline clearly shows time from keystroke to request

### Storage Tab (Unique to Firefox)

**Location**: Storage tab (not in Chrome)

Useful for verifying:
- localStorage: Any saved form state
- sessionStorage: Temporary session data
- IndexedDB: If app uses it

Check:
1. Click "Storage" tab
2. Expand "Local Storage" > http://localhost:5173
3. Look for form state keys (if any)

---

## SAFARI DevTools Setup (macOS Only)

### Enabling Safari DevTools

1. Open Safari > Preferences > Advanced
2. Check "Show Develop menu in menu bar"
3. Close preferences

### Accessing DevTools

1. Go to http://localhost:5173/modeling-wizard
2. Right-click > Inspect Element
3. DevTools opens at bottom

### Network Inspection

1. Click "Network" tab
2. Ensure recording is ON
3. Perform your test
4. Look for POST/PATCH requests in the list

**Note**: Safari DevTools is simpler than Chrome/Firefox but shows key information:
- Request method, URL, status
- Request headers and body
- Response headers and content
- Timing information

### Console Access

1. Click "Console" tab
2. Type JavaScript commands directly
3. View error messages and logs

---

## DEVELOPER TOOLS COMPARISON TABLE

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Network Tab | Excellent | Excellent | Good | Excellent |
| Console | Excellent | Excellent | Good | Excellent |
| Performance Profiler | Excellent | Good | Limited | Excellent |
| Memory Profiling | Excellent | Good | Limited | Excellent |
| Storage Inspector | Good | Excellent | Good | Good |
| Responsive Design | Excellent | Excellent | Excellent | Excellent |

**Recommendation for QA**: Chrome or Firefox (both have complete tooling)

---

## QA WORKFLOW SETUP

### Optimal DevTools Layout for Testing

**Goal**: See application + Network tab simultaneously

**Chrome/Edge**:
```
┌─────────────────────────────┬──────────────────────────┐
│                             │  DevTools (right side)   │
│   Application Window        ├──────────────────────────┤
│   (40% width)               │                          │
│                             │   Network Tab            │
│   - Modeling Wizard         │   (60% width)            │
│   - FeesExpensesStep        │                          │
│   - Form inputs             │   Filter: POST|PATCH     │
│                             │   Recording: ON          │
└─────────────────────────────┴──────────────────────────┘
```

**Firefox**:
```
Same layout as Chrome (similar DevTools)
Storage tab available for advanced debugging
```

### Quick Start Checklist for Each Test

Before each test case, verify:

1. **Network Tab Ready**:
   - [ ] Recording is ON (red circle)
   - [ ] Filter shows only API requests
   - [ ] Previous requests cleared (click trash icon)
   - [ ] Timestamp column visible

2. **Console Tab Ready**:
   - [ ] Console visible (or on second tab)
   - [ ] Filter set to "Errors" (to reduce noise)
   - [ ] Clear previous logs

3. **Application Ready**:
   - [ ] At Step 4: Fees & Expenses
   - [ ] Form loaded and visible
   - [ ] All fields interactive

4. **Timing Method Ready**:
   - [ ] Clock or timer visible
   - [ ] Know how to measure 750ms (count roughly, or use Performance tab)

---

## TESTING EACH SCENARIO

### Scenario 1: Debounce Timing Verification

**Setup**:
1. Network tab visible, recording ON
2. Clear any previous requests
3. Focus on "Rate (%)" field

**Steps**:
```
1. Type "2.5" slowly
   → Watch Network tab: NO request yet ✓

2. Stop typing, wait and count: "one-thousand-one, one-thousand-two, ... one-thousand-seven"
   → After about 7 seconds (750ms): One POST request appears ✓

3. Click on the request to inspect:
   - Method: POST or PATCH
   - URL: .../modeling-wizard/... or .../fees...
   - Payload: Contains "managementFee": {"rate": 2.5, ...}
   - Status: 200 or 201 ✓
```

### Scenario 2: Invalid Data Rejection

**Setup**:
1. Network tab ready
2. Console tab ready (filtered to Errors)
3. Validation rule: Rate 0-5%

**Steps**:
```
1. Type "10" in Rate field
   → Console shows error: "Must be between 0 and 5" ✓
   → Check Network tab: NO request ✓

2. Wait 1500ms (to ensure debounce interval passes)
   → Network tab still empty (no save attempted) ✓

3. Change to "3.5" (valid)
   → Console error clears ✓
   → Wait 750ms → Network request fires ✓
```

### Scenario 3: beforeunload Warning

**Setup**:
1. Enter "2.5" in Rate field (don't wait for auto-save)
2. Focus on application window

**Steps**:
```
1. Press Ctrl+W (or Cmd+W on Mac) to close tab
   → Browser dialog appears: "You have unsaved changes..."
   → User can click Cancel or Leave ✓

2. Click Cancel
   → Return to form with value "2.5" still there ✓

3. Wait 750ms for auto-save
   → Network request fires ✓

4. Press Ctrl+W again
   → NO dialog this time (isDirty = false) ✓
   → Tab closes successfully ✓
```

---

## KEYBOARD SHORTCUTS FOR DEVTOOLS

### Chrome / Edge / Firefox

| Action | Shortcut |
|--------|----------|
| Open DevTools | F12 |
| Toggle DevTools | F12 |
| Console tab | Ctrl+Shift+J (Win) / Cmd+Option+J (Mac) |
| Network tab | Ctrl+Shift+E (Win) / Cmd+Option+E (Mac) |
| Dock side | Ctrl+Shift+D (Win) / Cmd+Shift+D (Mac) |
| Clear network logs | Ctrl+L (Win) / Cmd+L (Mac) |
| Search DevTools | Ctrl+F (Win) / Cmd+F (Mac) |
| Inspect element | Ctrl+Shift+C / Cmd+Shift+C |

### Safari (macOS)

| Action | Shortcut |
|--------|----------|
| Open DevTools | Cmd+Option+U |
| Console | Cmd+Option+J |
| Network | Cmd+Option+E |
| Inspect element | Cmd+Option+Right-click |

---

## TROUBLESHOOTING DEVTOOLS

### Issue: Network Tab Empty (No Requests Showing)

**Cause**: Recording not ON, or wrong filter applied

**Fix**:
1. Look for red circle (recording indicator) - should be solid red
2. If gray, click it to start recording
3. Clear the filter search box (or set to default)
4. Try request again (type in form field)

---

### Issue: Can't See Network Request Timing

**Cause**: Requests table too narrow or timing column hidden

**Fix**:
1. Right-click on column headers
2. Enable "Time" or "Waterfall" column
3. Expand DevTools wider (drag separator)
4. Waterfall view shows visual timeline of each request

---

### Issue: Console Errors Too Verbose

**Cause**: Showing all logs, not just errors

**Fix**:
1. Click filter icon (funnel) in Console
2. Uncheck "Log" and "Warning"
3. Check "Error" only
4. Now only validation/critical errors show

---

### Issue: DevTools Closing When I Focus App

**Cause**: "Pause on exception" enabled (Firefox feature)

**Fix**:
1. Click "Pause on exceptions" button (pause icon)
2. Change from "All" to "Uncaught"
3. Or disable it entirely (for QA workflow)

---

## PERFORMANCE PROFILING (Advanced)

### Record Exact Debounce Timing

1. Open Performance tab
2. Click Record (red circle)
3. Immediately type "2.5" in Rate field
4. Wait for network request to fire (observe Network tab)
5. Click Record to stop

**Timeline Interpretation**:
```
Start recording
    ↓
    Click in Rate field
    ↓
    Type "2" (keyboard event)
    ↓
    Type "." (keyboard event)
    ↓
    Type "5" (keyboard event)
    ↓
    [750ms pause - debounce timer running]
    ↓
    Network request fires
    ↓
    Stop recording
```

**What to measure**:
- Time from last keystroke to network request: ~750ms
- Acceptable variance: ±50ms

---

## AUTOMATION POSSIBILITIES (For Future QA)

### Chrome Remote Debugging Protocol (CDP)

For future automation (not manual QA):
- Chrome DevTools Protocol allows remote control
- Can be used to automate Network tab inspection
- Could script test case execution and screenshot capture

### Browser Automation Tools

- **Playwright**: Can programmatically check Network tab
- **Puppeteer**: Headless browser with DevTools Protocol
- **Selenium**: Traditional browser automation

**Status**: Manual QA required now due to jest-dom import blocking automated tests

---

## NOTES & TIPS

1. **Screenshot Everything**: Use Print Screen or native screenshot tools to document:
   - Network request with timing
   - Console errors
   - UI state before/after
   - Save these for post-QA report

2. **Document Timing**: Use a stopwatch or phone timer for accurate 750ms measurement:
   - Start: Keystroke complete
   - Stop: Network request fires
   - Note: ±50ms is acceptable (JavaScript event loop variance)

3. **Browser Compatibility Checklist**:
   - Chrome: DevTools most comprehensive (recommend primary)
   - Firefox: Storage tab is unique/useful
   - Edge: Same as Chrome (Chromium-based)
   - Safari: Basic but functional

4. **Multi-Browser Testing**: Test sequence in each browser:
   1. All 3 debounce tests (1.1, 1.2, 1.3)
   2. One unmount test (3.1 or 3.2)
   3. One error test (4.1, 5.1, or 6.1)
   4. One dirty state test (7.1, 7.2, or 7.3)

5. **Network Request Inspection Checklist**:
   - [ ] Method: POST or PATCH
   - [ ] Status: 200 or 201
   - [ ] Timing: Visible in Network tab or Performance profiler
   - [ ] Payload: Contains correct field values
   - [ ] Response: Verify success object in response body

---

## FINAL VERIFICATION

Before starting QA tests, confirm:

- [ ] DevTools open and visible
- [ ] Network tab recording ON
- [ ] Filter shows only API requests
- [ ] Console ready to show errors
- [ ] Application at Step 4: Fees & Expenses
- [ ] All form fields interactive and visible
- [ ] Timing method ready (stopwatch or Performance tab)
- [ ] Multiple browsers ready for testing

**Status**: Ready to proceed with manual QA checklist

---

## REFERENCES

- Chrome DevTools: https://developer.chrome.com/docs/devtools/
- Firefox DevTools: https://developer.mozilla.org/en-US/docs/Tools
- Safari DevTools: https://developer.apple.com/safari/tools/
- Manual QA Guide: `/docs/qa/MANUAL-QA-SETUP-GUIDE.md`
- Test Checklist: `/docs/qa/fees-expenses-step-manual-qa-checklist.md`
