---
status: ACTIVE
last_updated: 2026-01-19
---

# Feature Flow Design Document Template
**Version:** 1.0
**Type:** UI/UX Feature Specification & User Flow Documentation
**Purpose:** Detailed feature specifications for screen-by-screen implementation

---

## Template Metadata
```yaml
template:
  id: feature-flow-doc-template-v1
  name: UI/UX Feature Flow Document
  version: 1.0
  output:
    format: markdown
    filename: "docs/features/{{feature_name}}-flow-document.md"
    title: "{{feature_title}} - Feature Flow Document"

workflow:
  mode: interactive
  apply_advanced_elicitation: true
  basecamp_pitch_inspired: true
```

---

## Document Change Log

| Date | Version | Description | Author |
| :--- | :------ | :---------- | :----- |
| {{date}} | {{version}} | {{description}} | {{author}} |

---

## 1. Feature Overview

### 1.1 Problem Statement
**Instruction:** Clearly articulate the problem this feature solves (Basecamp "Pitch" style)

**User Pain Point:**
{{describe_current_user_friction}}

**Business Impact:**
{{quantify_business_cost_of_problem}}

**Why Now:**
{{timing_and_urgency_rationale}}

**Example for VC Platform:**
> **Problem:** GPs spend 3-4 hours manually building "what-if" scenarios in Excel, making it impossible to explore multiple portfolio strategies during time-sensitive LP meetings.
>
> **Impact:** Delays strategic decisions, reduces scenario coverage from 10+ options to 2-3, causes missed insights.
>
> **Why Now:** Q1 fundraising season requires rapid scenario modeling; current tools are bottleneck.

### 1.2 Appetite
**Instruction:** Define time/resource constraints (Basecamp method)

**Time Budget:** {{weeks_or_sprints}}
**Team Size:** {{number_of_designers_developers}}
**Must-Have vs. Nice-to-Have Line:** {{clear_scope_boundary}}

**Example:**
> **Appetite:** 2 weeks, 1 designer + 2 developers
> **Must-Have:** Core scenario builder, comparison table, export to Excel
> **Nice-to-Have:** Real-time collaboration, version history, AI suggestions

### 1.3 Solution Summary
**Instruction:** High-level description of the proposed solution (2-3 paragraphs)

{{solution_overview}}

**Key User Benefits:**
- {{benefit_1}}
- {{benefit_2}}
- {{benefit_3}}

---

## 2. User Personas & Context

### 2.1 Primary Users
**Instruction:** Define who will use this feature and their context

**Persona:** {{persona_name}}
- **Role:** {{job_title}}
- **Goals:** {{what_they_want_to_achieve}}
- **Pain Points:** {{current_frustrations}}
- **Technical Proficiency:** {{comfort_level_with_technology}}

**Usage Context:**
- **Device:** {{desktop|tablet|mobile}}
- **Environment:** {{office|home|on_the_go}}
- **Frequency:** {{daily|weekly|monthly}}
- **Time Pressure:** {{urgent|planned|exploratory}}

**VC Platform Example:**
> **Persona:** Sarah Chen, Managing Partner
> - **Role:** GP at $200M early-stage VC fund
> - **Goals:** Model 5-10 portfolio scenarios before quarterly LP meeting
> - **Pain Points:** Excel is slow, error-prone, hard to compare scenarios
> - **Tech Level:** Advanced Excel user, moderate web app proficiency
>
> **Context:** Desktop (27" monitor), office, 2-3x per quarter, high time pressure

### 2.2 Secondary Users
**Instruction:** Define additional stakeholders (optional)

- **{{role}}:** {{needs_and_interaction_pattern}}
- **{{role}}:** {{needs_and_interaction_pattern}}

---

## 3. User Journey Map

**Instruction:** Map the complete user journey from entry to completion

### 3.1 Journey Phases

#### Phase 1: {{phase_name}} (Entry)
**Duration:** {{estimated_time}}
**User State:** {{emotional_state_and_context}}

**Steps:**
1. {{action_1}} → {{system_response}}
2. {{action_2}} → {{system_response}}
3. {{action_3}} → {{system_response}}

**Success Criteria:**
- {{measurable_outcome_1}}
- {{measurable_outcome_2}}

**Pain Points to Avoid:**
- {{anti_pattern_1}}
- {{anti_pattern_2}}

#### Phase 2: {{phase_name}} (Core Flow)
**Duration:** {{estimated_time}}
**User State:** {{emotional_state_and_context}}

**Steps:**
1. {{action}} → {{response}}
2. {{action}} → {{response}}

**Decision Points:**
- **If {{condition}}:** Navigate to {{alternate_path}}
- **Else:** Continue to {{default_path}}

#### Phase 3: {{phase_name}} (Completion)
**Duration:** {{estimated_time}}
**User State:** {{emotional_state_and_context}}

**Steps:**
1. {{final_action}} → {{confirmation}}
2. {{secondary_action}} → {{next_step_options}}

**Exit States:**
- **Success:** {{what_user_achieved}}
- **Partial:** {{incomplete_state_handling}}
- **Abandonment:** {{recovery_mechanism}}

### 3.2 Journey Map Diagram
**Instruction:** Visual representation of the journey

```
Entry → Discovery → Configuration → Review → Completion
  |         |            |           |          |
Pain     Question     Decision    Validation  Success
Point     Resolved     Made       Confirmed   Achieved
```

**VC Platform Example - Scenario Builder Journey:**
```
Dashboard → New Scenario → Fund Setup → Allocation → Review → Save
    |            |            |           |         |       |
  "I need      "What      "How much     "Does    "Looks  "Ready
   quick      params?"     capital?"    math     good"   for LP
 insights"                               work?"          meeting"
```

---

## 4. Screen-by-Screen Specifications

**Instruction:** Detail each screen/view in the flow with interaction states

### 4.1 Screen Template

#### Screen: {{screen_name}}

**Purpose:** {{what_this_screen_accomplishes}}

**Layout:** {{grid_structure_or_component_arrangement}}

**URL/Route:** `{{route_path}}`

**Access Control:** {{who_can_view_this_screen}}

**Components:**

| Component | Type | State | Behavior | Data Source |
|-----------|------|-------|----------|-------------|
| {{component_name}} | {{button|card|table|etc}} | {{default|hover|active|disabled|error}} | {{interaction_description}} | {{api_endpoint_or_context}} |

**Interaction States:**

1. **Default State**
   - Visual: {{description_of_initial_appearance}}
   - Data: {{what_data_is_displayed}}
   - Actions: {{available_user_actions}}

2. **Loading State**
   - Visual: {{skeleton_or_spinner_description}}
   - Timing: {{expected_duration}}
   - Cancellable: {{yes|no}}

3. **Error State**
   - Visual: {{error_presentation}}
   - Message: "{{user_friendly_error_message}}"
   - Recovery: {{how_user_can_recover}}

4. **Empty State**
   - Visual: {{illustration_and_message}}
   - Primary Action: "{{cta_button_text}}"
   - Secondary Action: {{optional_alternative}}

5. **Success State**
   - Visual: {{confirmation_indicator}}
   - Next Steps: {{suggested_actions}}
   - Persistence: {{auto_save_or_manual}}

**Responsive Behavior:**

- **Desktop (1024px+):** {{layout_description}}
- **Tablet (640-1023px):** {{layout_adjustments}}
- **Mobile (320-639px):** {{mobile_specific_changes}}

**Accessibility:**

- **Keyboard Navigation:** {{tab_order_and_shortcuts}}
- **Screen Reader:** {{aria_labels_and_descriptions}}
- **Focus Management:** {{where_focus_goes}}

**Wireframe Reference:** `{{figma_link_or_sketch}}`

---

### 4.2 VC Platform Example - Scenario Comparison Screen

#### Screen: Scenario Comparison Dashboard

**Purpose:** Allow GPs to compare 2-6 fund scenarios side-by-side with key metrics

**Layout:** Sticky header + horizontal scrolling table (frozen first column) + action footer

**URL:** `/scenarios/compare?ids={{scenario_ids}}`

**Access Control:** Fund admins and GPs only

**Components:**

| Component | Type | State | Behavior | Data Source |
|-----------|------|-------|----------|-------------|
| Scenario Selector | Multi-select dropdown | Default/Open/Selected | Add/remove scenarios from comparison (max 6) | `/api/scenarios/list` |
| Metrics Table | Data table | Default/Sorted/Filtered | Click header to sort, hover row for details | `/api/scenarios/compare` |
| Diff Highlighter | Visual indicator | Auto | Highlights cells with >10% variance from median | Client-side calculation |
| Export Button | Action button | Default/Hover/Loading/Success | Downloads comparison as Excel with charts | `/api/export/comparison` |

**Interaction States:**

1. **Default State**
   - Visual: Table with 3 pre-selected scenarios, metrics in rows, scenarios in columns
   - Data: Core metrics (NAV, IRR, MOIC, DPI) with color-coded performance
   - Actions: Add scenario, remove scenario, export, share link

2. **Loading State**
   - Visual: Skeleton table with shimmer effect on metric rows
   - Timing: < 500ms for cached scenarios, < 2s for fresh calculations
   - Cancellable: Yes (via Escape key or close button)

3. **Error State** (Calculation Failure)
   - Visual: Yellow warning banner above table
   - Message: "Unable to calculate metrics for Scenario B. Check allocation totals (must sum to 100%)."
   - Recovery: "Edit Scenario B" button → Opens scenario editor in modal

4. **Empty State** (No Scenarios Selected)
   - Visual: Centered illustration of comparison chart + message
   - Primary Action: "Select Scenarios to Compare"
   - Secondary Action: "Create New Scenario" (if < 3 scenarios exist)

5. **Success State** (Export Complete)
   - Visual: Green toast notification bottom-right
   - Message: "Comparison exported to Downloads folder"
   - Next Steps: "Open File" button or auto-dismiss after 5s

**Responsive Behavior:**

- **Desktop (1024px+):** Full table with 6 columns visible, sticky header on scroll
- **Tablet (640-1023px):** Horizontal scroll with frozen first column, max 4 scenarios visible
- **Mobile (320-639px):** Accordion layout - each scenario is expandable card with metrics inside

**Accessibility:**

- **Keyboard Navigation:** Tab through scenarios, Shift+Tab to reverse, Enter to expand/collapse (mobile)
- **Screen Reader:** "Comparing 3 scenarios: Base Case, Aggressive Growth, Conservative. Sorted by IRR descending."
- **Focus Management:** After export, focus moves to toast notification with "Open File" button

**Wireframe Reference:** [Figma - Scenario Comparison v3]({{figma_link}})

---

## 5. Interaction Patterns & Micro-interactions

**Instruction:** Define common interaction behaviors used across screens

### 5.1 Pattern Library

#### Pattern: {{pattern_name}}

**Use Case:** {{when_to_use_this_pattern}}

**Trigger:** {{user_action_or_system_event}}

**Behavior:**
1. {{step_1_description}}
2. {{step_2_description}}
3. {{step_3_description}}

**Visual Feedback:**
- **Duration:** {{milliseconds}}
- **Animation:** {{ease_function_and_properties}}
- **Sound:** {{optional_audio_feedback}}

**Code Example:**
```tsx
// Example implementation
const handleInteraction = () => {
  // Pattern logic
};
```

### 5.2 VC Platform Patterns

#### Pattern: Scenario Duplication (Quick Clone)

**Use Case:** User wants to create variation of existing scenario without re-entering all data

**Trigger:** Right-click scenario card OR click "..." menu → "Duplicate"

**Behavior:**
1. Show confirmation dialog: "Create copy of [Scenario Name]?"
2. On confirm: POST to `/api/scenarios/{id}/duplicate`
3. New scenario appears below original with "(Copy)" suffix
4. Auto-focus new scenario's name field for immediate rename

**Visual Feedback:**
- **Duration:** 150ms card expansion + 250ms slide-in animation
- **Animation:** ease-out, translateY(-100% → 0)
- **Sound:** None (silent operation)

**Accessibility:**
- Keyboard shortcut: `Ctrl+D` when scenario is focused
- Screen reader: "Scenario duplicated. New name: [Name] (Copy). Press Enter to rename."

---

## 6. Data Model & API Integration

**Instruction:** Define data requirements and API endpoints

### 6.1 Data Entities

#### Entity: {{entity_name}}

**Fields:**
| Field | Type | Validation | Default | Notes |
|-------|------|------------|---------|-------|
| {{field}} | {{string|number|date|etc}} | {{constraints}} | {{default_value}} | {{description}} |

**Relationships:**
- **Belongs to:** {{parent_entity}}
- **Has many:** {{child_entities}}
- **References:** {{related_entities}}

**Example:**
```json
{
  "id": "{{uuid}}",
  "{{field}}": "{{value}}",
  "created_at": "{{iso_timestamp}}",
  "updated_at": "{{iso_timestamp}}"
}
```

### 6.2 API Endpoints

#### Endpoint: {{method}} {{path}}

**Purpose:** {{what_this_endpoint_does}}

**Authentication:** {{required_auth_level}}

**Request:**
```http
{{METHOD}} {{/api/path}}
Content-Type: application/json

{
  "{{param}}": "{{type}}"
}
```

**Response (Success):**
```http
200 OK
Content-Type: application/json

{
  "data": {{response_shape}},
  "meta": {
    "timestamp": "{{iso_timestamp}}"
  }
}
```

**Response (Error):**
```http
{{status_code}} {{status_text}}

{
  "error": {
    "code": "{{error_code}}",
    "message": "{{user_friendly_message}}",
    "field": "{{field_with_error}}"
  }
}
```

**Caching:** {{cache_strategy}}

**Rate Limit:** {{requests_per_minute}}

---

## 7. Validation & Business Rules

**Instruction:** Define all validation rules and business logic

### 7.1 Client-Side Validation

**Field:** {{field_name}}

**Rules:**
- **Required:** {{yes|no}}
- **Format:** {{regex_or_format_description}}
- **Range:** {{min}} to {{max}}
- **Custom Logic:** {{special_validation_rules}}

**Error Messages:**
- **Empty:** "{{message}}"
- **Invalid Format:** "{{message}}"
- **Out of Range:** "{{message}}"
- **Custom Error:** "{{message}}"

**Example - VC Platform Reserve Allocation:**

**Field:** `reserveRatioPct`

**Rules:**
- **Required:** Yes
- **Format:** Decimal number, max 1 decimal place
- **Range:** 0 to 100
- **Custom:** Must be ≥ 30% for funds with >50 portfolio companies

**Error Messages:**
- **Empty:** "Reserve ratio is required"
- **Invalid:** "Enter a valid percentage (e.g., 42.5)"
- **Out of Range:** "Reserve ratio must be between 0% and 100%"
- **Custom:** "Funds with >50 companies typically reserve 30%+ for follow-ons. Confirm {{enteredValue}}%?"

### 7.2 Cross-Field Validation

**Rule Name:** {{validation_rule_name}}

**Logic:** {{description_of_relationship_between_fields}}

**Fields Involved:** {{field_1}}, {{field_2}}, {{field_3}}

**Validation:**
```
IF {{condition}}
THEN {{error_or_warning}}
```

**Example - Allocation Sum Rule:**

**Rule Name:** Allocation Must Sum to 100%

**Logic:** Sum of all stage allocation percentages + reserves must equal exactly 100%

**Fields:** `preSeedPct`, `seedPct`, `seriesAPct`, `seriesBPct`, `seriesCPct`, `seriesDPct`, `reservesPct`

**Validation:**
```
IF SUM(allAllocations) ≠ 100
THEN BLOCK_SAVE + SHOW_ERROR("Allocations must sum to 100%. Current total: {{actualSum}}%")
```

**Auto-Fix Option:** "Balance remainder into Reserves" button

---

## 8. Edge Cases & Error Handling

**Instruction:** Document all edge cases and how to handle them

### 8.1 Edge Case Catalog

#### Edge Case: {{case_name}}

**Scenario:** {{description_of_unusual_situation}}

**User Impact:** {{how_this_affects_user_experience}}

**Handling Strategy:**
- **Prevention:** {{how_to_avoid_this_case}}
- **Detection:** {{how_system_identifies_this_case}}
- **Resolution:** {{what_system_does_to_fix_or_guide_user}}

**UI Behavior:** {{what_user_sees}}

**Example - Division by Zero in Return Calculations:**

**Scenario:** User sets fund size to $0 or all allocations to 0%, causing division by zero in IRR calculations

**User Impact:** Calculations fail silently, showing NaN or Infinity in metrics

**Handling:**
- **Prevention:** Require fund size ≥ $1M during setup, disable allocation fields if fund size = 0
- **Detection:** Validate `fundSizeUSD > 0` before any calculation API call
- **Resolution:** Show inline error: "Fund size must be at least $1M to calculate metrics. Current: $0."

**UI Behavior:**
- Input field shows red border
- Calculation results show "—" (em dash) instead of NaN
- Save button disabled until fixed

### 8.2 Error Recovery Flows

**Error Type:** {{error_category}}

**User-Facing Message:** "{{friendly_error_message}}"

**Recovery Steps:**
1. {{step_1}}
2. {{step_2}}
3. {{step_3}}

**Fallback:** {{what_happens_if_recovery_fails}}

**Example - API Timeout:**

**Error Type:** Network/API Timeout (30s+ request)

**Message:** "Taking longer than expected. Your work is saved, but calculations are still processing."

**Recovery Steps:**
1. Show progress indicator: "Processing... ({{elapsed_time}}s)"
2. After 30s: Offer "Run in background" option → User can navigate away
3. Notify via toast when complete: "Scenario calculations ready. View results?"

**Fallback:** If background processing fails → Email user results OR save as "Pending" with retry button

---

## 9. Usability Testing Plan

**Instruction:** Define how to validate the feature with users

### 9.1 Testing Objectives

**Primary Goals:**
- {{objective_1}}
- {{objective_2}}
- {{objective_3}}

**Success Metrics:**
- **Task Completion Rate:** {{target_percentage}}%
- **Time on Task:** {{target_duration}}
- **Error Rate:** < {{max_errors_per_task}}
- **Satisfaction Score:** {{target_score}}/10

### 9.2 Test Scenarios

#### Scenario 1: {{scenario_name}}

**Participant Profile:** {{user_type_and_experience_level}}

**Task:** "{{task_instruction_given_to_participant}}"

**Success Criteria:**
- Completes task without assistance
- Achieves correct result
- Completes within {{time_limit}}

**Observations to Capture:**
- {{observation_1}}
- {{observation_2}}
- {{observation_3}}

**Example - Scenario Comparison Task:**

**Participant:** GP with 2-5 years experience, moderate tech proficiency

**Task:** "Compare your 3 saved scenarios to determine which has the highest projected IRR at Year 7. Export the comparison for your team."

**Success Criteria:**
- Navigates to comparison view independently
- Selects correct scenarios (max 3 attempts)
- Identifies highest IRR accurately
- Exports successfully within 3 minutes

**Observations:**
- Does user find the "Compare" button easily?
- Can user interpret IRR values without guidance?
- Does export button location/label make sense?
- Any confusion around metric definitions?

### 9.3 Feedback Collection

**Methods:**
- **Think-aloud protocol:** Record verbal feedback during tasks
- **Post-task questionnaire:** SUS (System Usability Scale) + custom questions
- **Heat maps:** Track clicks and scroll patterns
- **Session recordings:** Capture full interaction for analysis

**Timeline:** {{testing_schedule}}

**Sample Size:** {{number_of_participants}}

---

## 10. Performance & Technical Constraints

**Instruction:** Define performance budgets and technical requirements

### 10.1 Performance Budgets

**Metric:** {{metric_name}}

**Target:** {{target_value}}

**Measurement:** {{how_to_measure}}

**Enforcement:** {{what_happens_if_exceeded}}

**Budget Table:**

| Metric | Target | Critical Threshold | Measurement Tool |
|--------|--------|-------------------|------------------|
| Page Load Time | < 2s | < 3s | Lighthouse |
| API Response | < 500ms | < 1s | Network tab |
| Animation FPS | 60fps | 30fps | Chrome DevTools |
| Bundle Size | < 200KB | < 300KB | Webpack Bundle Analyzer |

### 10.2 Technical Dependencies

**Required Services:**
- {{service_1}}: {{version_and_purpose}}
- {{service_2}}: {{version_and_purpose}}

**Browser Support:**
- Chrome/Edge: {{versions}}
- Firefox: {{versions}}
- Safari: {{versions}}

**Device Support:**
- Desktop: {{os_and_screen_sizes}}
- Tablet: {{os_and_screen_sizes}}
- Mobile: {{os_and_screen_sizes}}

### 10.3 Data Constraints

**Field:** {{field_name}}

**Limits:**
- **Max Length:** {{characters_or_bytes}}
- **Max File Size:** {{size}} (for uploads)
- **Max Records:** {{count}} (for lists/tables)

**Example - VC Platform Scenario Limits:**

| Entity | Max Count | Rationale |
|--------|-----------|-----------|
| Scenarios per Fund | 50 | Prevent DB bloat, encourage archiving |
| Companies per Scenario | 200 | UI performance (table rendering) |
| Comparison Scenarios | 6 | Screen width limit, cognitive load |
| Export File Size | 10MB | Email attachment compatibility |

---

## 11. Rabbit Holes (Risks & Scope Creep)

**Instruction:** Identify potential scope creep and define boundaries (Basecamp method)

### 11.1 Known Risks

**Risk:** {{what_could_derail_the_project}}

**Probability:** {{high|medium|low}}

**Impact:** {{severity_if_it_occurs}}

**Mitigation:**
- {{prevention_strategy_1}}
- {{contingency_plan_2}}

**Example - Real-Time Collaboration:**

**Risk:** Users request "Google Docs-style" real-time collaboration for scenario editing

**Probability:** High (it's a common feature request)

**Impact:** Medium-High (would add 2-3 weeks to timeline, requires WebSocket infrastructure)

**Mitigation:**
- **Scope Boundary:** "V1 will NOT support real-time collaboration. Users see 'Last edited by [User] at [Time]' warnings."
- **Future:** Add to V2 roadmap if >30% of users request it
- **Workaround:** Export/import scenarios for sharing via email

### 11.2 Out of Scope (No-Gos)

**Feature:** {{feature_name}}

**Reason for Exclusion:** {{why_not_including_this}}

**Alternative:** {{what_users_should_do_instead}}

**List:**
- ❌ {{excluded_feature_1}}
- ❌ {{excluded_feature_2}}
- ❌ {{excluded_feature_3}}

**Example - VC Platform V1:**
- ❌ **AI-powered scenario suggestions** → Reason: Insufficient training data, 3+ week effort
- ❌ **Mobile app (native)** → Reason: Desktop-first use case, web responsive is sufficient
- ❌ **Scenario version history** → Reason: "Duplicate scenario" covers 80% of use case

---

## 12. Success Metrics & Analytics

**Instruction:** Define how to measure feature success post-launch

### 12.1 Key Performance Indicators (KPIs)

**Metric:** {{metric_name}}

**Definition:** {{how_metric_is_calculated}}

**Target:** {{success_threshold}}

**Tracking:** {{analytics_event_or_query}}

**KPI Dashboard:**

| KPI | Target | Current | Trend | Action If Below Target |
|-----|--------|---------|-------|------------------------|
| {{metric}} | {{target}} | {{value}} | {{↑|↓|→}} | {{remediation_plan}} |

### 12.2 Analytics Events

**Event:** `{{event_name}}`

**Trigger:** {{when_event_fires}}

**Properties:**
```json
{
  "user_id": "{{uuid}}",
  "{{property}}": "{{value}}",
  "timestamp": "{{iso_timestamp}}"
}
```

**Analysis Questions:**
- {{question_1}}
- {{question_2}}

**Example - Scenario Comparison Analytics:**

**Event:** `scenario_comparison_viewed`

**Trigger:** User opens comparison screen with 2+ scenarios selected

**Properties:**
```json
{
  "user_id": "uuid",
  "scenario_count": 3,
  "scenario_ids": ["id1", "id2", "id3"],
  "comparison_duration_sec": 42,
  "exported": true,
  "timestamp": "2025-10-15T14:30:00Z"
}
```

**Analysis:**
- What's the average number of scenarios compared? (Target: 3+)
- Do users export comparisons? (Target: 60% export rate)
- How long do users spend analyzing? (Benchmark: 30-90s)

---

## 13. Design Handoff Checklist

**Instruction:** Ensure all deliverables are ready for development

### 13.1 Deliverables

- [ ] **Wireframes:** {{figma_link_or_sketch}}
- [ ] **High-fidelity mockups:** {{figma_link}} (all states: default, hover, active, error, empty)
- [ ] **Interactive prototype:** {{prototype_link}} (clickable flow)
- [ ] **Design specs:** Component spacing, colors, typography annotated
- [ ] **Asset export:** Icons (SVG), images (WebP), illustrations (optimized)
- [ ] **Accessibility audit:** WCAG 2.1 AA compliance verified
- [ ] **Responsive layouts:** Mobile (375px), tablet (768px), desktop (1440px) designed
- [ ] **API contract:** Endpoint docs reviewed with backend team
- [ ] **Copy deck:** All UI text, error messages, tooltips finalized
- [ ] **Animation specs:** Easing functions, durations, triggers documented

### 13.2 Developer Resources

**Design System Components Used:**
- {{component_1}} - [Storybook]({{link}})
- {{component_2}} - [Storybook]({{link}})

**Custom Components Needed:**
- {{new_component}} - [Design Spec]({{link}})

**Data Mocks:**
- {{mock_data_file}} - [JSON]({{link}})

**Feature Flags:**
- `{{flag_name}}`: {{description_and_default_state}}

---

## 14. Implementation Notes

**Instruction:** Technical guidance for developers

### 14.1 Code Structure

**File Organization:**
```
src/
  features/
    {{feature_name}}/
      components/
        {{Screen}}.tsx
        {{Component}}.tsx
      hooks/
        use{{Hook}}.ts
      api/
        {{feature}}Api.ts
      types/
        {{Feature}}Types.ts
      __tests__/
        {{Feature}}.test.tsx
```

### 14.2 State Management

**State Location:** {{context|redux|zustand|local}}

**Data Flow:**
```
User Action → Component Event → Hook/API Call → State Update → Re-render
```

**Example:**
```tsx
const [scenarios, setScenarios] = useState<Scenario[]>([]);

const handleCompare = async (ids: string[]) => {
  setLoading(true);
  try {
    const data = await api.compareScenarios(ids);
    setScenarios(data);
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false);
  }
};
```

### 14.3 Testing Strategy

**Unit Tests:**
- [ ] All business logic functions
- [ ] Validation rules
- [ ] Data transformations

**Integration Tests:**
- [ ] API interactions
- [ ] State management flow
- [ ] Cross-component communication

**E2E Tests:**
- [ ] Critical user paths (happy path)
- [ ] Error scenarios
- [ ] Accessibility keyboard flow

---

## 15. Launch Plan

**Instruction:** Define rollout strategy

### 15.1 Rollout Phases

**Phase 1: Internal Beta**
- **Audience:** {{team_size}} internal users
- **Duration:** {{timeframe}}
- **Goals:** Bug discovery, UX feedback

**Phase 2: Limited Release**
- **Audience:** {{percentage}}% of users OR {{specific_segment}}
- **Duration:** {{timeframe}}
- **Goals:** Performance monitoring, edge case discovery

**Phase 3: General Availability**
- **Audience:** All users
- **Criteria for GA:** {{metrics_that_must_pass}}

### 15.2 Feature Flag Strategy

**Flag:** `enable_{{feature_name}}`

**Default:** `false`

**Override Rules:**
- **Internal users:** Always `true`
- **Beta users:** `true` if `user.beta_tester === true`
- **Production:** Gradual rollout via {{percentage}}% sampling

### 15.3 Rollback Plan

**Trigger Criteria:**
- Error rate > {{threshold}}%
- Performance degradation > {{percentage}}%
- User complaints > {{count}} per hour

**Rollback Steps:**
1. Set feature flag to `false` globally
2. Notify users via banner: "{{feature}} temporarily disabled"
3. Investigate and fix
4. Re-enable for beta users only
5. Gradual re-rollout after fix verification

---

## 16. Post-Launch Review

**Instruction:** Plan for iteration and improvement

### 16.1 Review Timeline

**1 Week Post-Launch:**
- [ ] Review analytics dashboard
- [ ] Collect user feedback (survey)
- [ ] Bug triage and prioritization

**1 Month Post-Launch:**
- [ ] Analyze KPIs vs. targets
- [ ] Identify top feature requests
- [ ] Plan V2 roadmap

### 16.2 Iteration Candidates

**Enhancement:** {{improvement_idea}}

**User Request Frequency:** {{percentage_of_users}}

**Effort Estimate:** {{hours_or_days}}

**Priority:** {{high|medium|low}}

**Rationale:** {{why_prioritize_or_defer}}

---

## 17. Appendices

### 17.1 References

**Design Inspiration:**
- {{product_or_pattern}} - [Link]({{url}})

**Research:**
- {{study_or_report}} - [Link]({{url}})

**Competitive Analysis:**
- {{competitor}} - [Analysis Doc]({{link}})

### 17.2 Glossary

| Term | Definition |
|------|------------|
| {{term}} | {{definition}} |

**VC Platform Example:**

| Term | Definition |
|------|------------|
| IRR | Internal Rate of Return - annualized return rate accounting for timing of cash flows |
| DPI | Distributions to Paid-In capital - cash returned to LPs divided by capital called |
| MOIC | Multiple on Invested Capital - total value divided by cost basis |
| Pro-Rata | Right to maintain ownership percentage in follow-on rounds |
| Waterfall | Distribution mechanism (LP returns first, then GP carry) |

### 17.3 Related Documents

- [Design System]({{link}})
- [API Documentation]({{link}})
- [User Research Findings]({{link}})
- [Technical Architecture]({{link}})

---

**Document Owner:** {{name_and_role}}
**Reviewers:** {{stakeholders}}
**Last Updated:** {{date}}
**Next Review:** {{future_date}}
