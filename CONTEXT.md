# Venture Fund Modeling Context

This context defines the domain language used for venture fund modeling and
reporting. It exists to keep fund analysis, allocation, and economics terms
distinct.

## Language

**Analysis Cohort**: A portfolio exposure grouping used to compare fund
performance by vintage granularity. _Avoid_: Cohort

**Cohort Analysis**: The user-facing feature for comparing fund performance
across analysis groupings. _Avoid_: Analysis cohorts feature

**Cohort**: The user-facing name for an analysis grouping, usually labeled by
vintage. _Avoid_: Cohort definition

**Cohort Definition**: A saved rule set for producing **Analysis Cohorts** for a
fund. _Avoid_: Cohort config, cohort setup

**Cohort Membership Unit**: The declared unit, company or investment, used by a
**Cohort Definition** to assign exposure to **Analysis Cohorts**. _Avoid_:
Cohort mode

**Company-Level Analysis**: Analysis where all included investments for a
company are grouped under the **Cohort Key** of its earliest included
investment. _Avoid_: Company cohort

**Cohort Key Shift**: The reassignment of a company-level **Cohort Key** when
earlier investments are excluded. _Avoid_: Cohort shift

**Investment-Level Analysis**: Analysis where each included investment belongs
to the **Cohort Key** for that investment. _Avoid_: Investment cohort

**Company Exclusion**: A rule that removes a company and all of its investments
from analysis. _Avoid_: Company cohort exclusion

**Investment Exclusion**: A rule that removes a single investment from analysis.
_Avoid_: Investment cohort exclusion

**Cohort Key**: The vintage label assigned to a company or investment for
analysis grouping. _Avoid_: Cohort

**Fund Vintage Year**: The year of a fund's first capital call, falling back to
establishment year only before any capital call exists. _Avoid_: Vintage year
when the subject is ambiguous

**Cohort Bucket**: A metrics grouping formed from a **Cohort Key** and a
**Sector Classification**. _Avoid_: Cohort

**Sector Classification**: The business category assigned to a company for
analysis grouping. _Avoid_: Investment sector

**Unmapped Sector Classification**: A placeholder **Sector Classification** for
companies whose business category has not been mapped. _Avoid_: Excluded sector,
unknown sector

## Fund And Firm Language

**Firm**: The investment management organization that manages one or more funds.
_Avoid_: Account

**Fund**: An investment vehicle managed by a firm for a defined strategy and
partner base. _Avoid_: Portfolio

**Fund Size**: Total committed capital across all partners in a fund. _Avoid_:
AUM when discussing committed fund capital

**Fund Reporting Currency**: The currency used to report fund values and
performance. _Avoid_: Currency when the reporting context is ambiguous

**As-Of Date**: The date through which reported values and metrics are current.
_Avoid_: Snapshot date when speaking to end users

**Reporting Period**: The time interval covered by reported fund, partner, or
investment metrics. _Avoid_: Date range when a formal reporting interval is
intended

**Fund AUM Bucket**: A size category used to compare funds against peers.
_Avoid_: Fund size when discussing benchmark grouping

## Fund Model And Forecast Language

**Fund Model**: A configurable projection of fund commitments, investments,
reserves, exits, fees, expenses, and performance. _Avoid_: Fund when referring
to modeled assumptions rather than the legal vehicle

**Fund Configuration**: The fund-level assumptions used by a fund model.
_Avoid_: Fund performance

**Fund Start Date**: The date from which a fund model begins measuring periods
and cash flows. _Avoid_: Fund vintage year

**Fund End Date**: The modeled end of the fund's life. _Avoid_: As-of date

**Capital Call Schedule**: The cadence used to model capital calls. _Avoid_:
Reporting period

**Credit Facility**: A borrowing facility used to bridge capital needs before
partner capital is called. _Avoid_: Capital commitment

**Credit Facility Size**: The maximum borrowing capacity available under a
credit facility. _Avoid_: Fund size

**Facility Term**: The modeled duration of a credit facility. _Avoid_: Fund term

**Repayment Term**: The modeled time allowed to repay credit facility
borrowings. _Avoid_: Facility term

**Interest Rate**: The rate charged on borrowed capital. _Avoid_: Preferred
return

**Unused Fee**: A fee charged on undrawn credit facility capacity. _Avoid_:
Management fee

**Management Fee Waiver**: A reduction or waiver of management fees used as part
of fund economics, commonly alongside cashless GP commitment treatment. _Avoid_:
Cashless GP commitment

**LP Commitment Percentage**: The percentage of fund commitments attributed to
limited partners. _Avoid_: Paid-in capital

**GP Commitment Percentage**: The percentage of fund commitments attributed to
the general partner. _Avoid_: Carried interest

**GP Cash Commitment**: The portion of the GP commitment contributed in cash.
_Avoid_: Cashless GP commitment

**Cashless GP Commitment**: The portion of the GP commitment credited without a
cash contribution, commonly associated with management fee waiver economics.
_Avoid_: Cash balance, cashless exercise

**Cashless GP Contribution Percentage**: The percentage of the GP commitment
treated as cashless. _Avoid_: Cashless split when the split basis is unclear

**Fund KPI**: A computed fund-level output metric, such as TVPI, DPI, RVPI, IRR,
NAV, or investment count. _Avoid_: Company metric

**Dual Forecast**: The product comparison between the **Construction Forecast**
and the **Current Forecast**. _Avoid_: Scenario comparison when the two views
are specifically construction/current

**Forecast Period**: A model period measured from the fund start date. _Avoid_:
Reporting period when discussing actual reporting intervals

**Construction Forecast**: The pro-forma forecast based on planned fund
construction, including uncommitted capital and planned follow-on investments.
_Avoid_: Current forecast

**Current Forecast**: The forecast based on the fund's current portfolio and
currently committed or deployed capital. _Avoid_: Construction forecast

**Cash Flow Event**: A dated model event that changes fund cash flows, such as
an initial investment, follow-on investment, dividend, or exit. _Avoid_:
Investment transaction when referring to forecast cash flows

**Initial Investment**: The first modeled investment into a portfolio company.
_Avoid_: Follow-on investment

**Follow-On Investment**: An additional modeled investment into an existing
portfolio company. _Avoid_: Initial investment

**Follow-On Reserve**: Capital planned for future follow-on investments.
_Avoid_: Dry powder when specifically reserved for follow-ons

**Dividend**: Investment income paid by a portfolio company to the fund.
_Avoid_: Distribution when describing company-to-fund cash flow

**Forecast Exit**: A modeled exit cash flow for a portfolio company. _Avoid_:
Realization when no actual exit has occurred

## Fund Performance Language

**Paid-In Capital**: Capital contributed to the fund by partners. _Avoid_:
Invested capital

**Capital Commitment**: Capital a partner has agreed to contribute to the fund.
_Avoid_: Paid-in capital

**Capital Call**: A request for partners to contribute committed capital to the
fund. _Avoid_: Contribution request

**Capital Contribution**: Capital paid into the fund by partners. _Avoid_:
Capital call when payment has already occurred

**Capital Call Receivable**: Called capital owed to the fund but not yet
received. _Avoid_: Contribution

**Deferred Capital Call**: A capital call approved or scheduled for a future
date. _Avoid_: Capital contribution

**Distribution**: Capital returned from the fund to partners. _Avoid_: Payout

**Distribution Payable**: A distribution approved but not yet paid to partners.
_Avoid_: Distribution

**NAV**: Net Asset Value, the current residual value of fund or investment
holdings. _Avoid_: Portfolio value

**Total Value**: The sum of **NAV** and cumulative **Distributions**. _Avoid_:
NAV

**DPI**: Distributions to Paid-In, the realized return multiple from
distributions divided by **Paid-In Capital**. _Avoid_: Distributed multiple

**RVPI**: Residual Value to Paid-In, the unrealized return multiple from **NAV**
divided by **Paid-In Capital**. _Avoid_: Residual multiple

**TVPI**: Total Value to Paid-In, the total return multiple from **DPI** plus
**RVPI**. _Avoid_: Total multiple

**MOIC**: Multiple on Invested Capital, the value multiple measured against
invested capital. _Avoid_: Multiple

**Dry Powder**: Remaining capital available for future investments and fund
expenses. _Avoid_: Uncalled capital when expenses are included

**Management Fee**: A fee paid to the manager for operating the fund. _Avoid_:
Operating expense

**Operating Expense**: A non-management-fee fund cost. _Avoid_: Management fee

**Net Realized Gain/Loss**: Realized gain or loss from exited investments after
cost basis. _Avoid_: Distribution

**Net Unrealized Gain/Loss**: Unrealized gain or loss on current holdings after
cost basis. _Avoid_: NAV

**Net IRR**: The fund-level internal rate of return after fees, expenses, and
carried interest. _Avoid_: Gross IRR

**Gross IRR**: The investment-level internal rate of return before fund-level
fees, expenses, and carried interest. _Avoid_: Net IRR

## Portfolio Investment Language

**Portfolio Company**: A company in which the fund holds or held an investment.
_Avoid_: Issuer in end-user copy

**Investment**: A fund position in a portfolio company or asset. _Avoid_:
Company

**Investment Details**: Portfolio-company investment records describing
financing rounds, share classes, securities, and investment transactions.
_Avoid_: Company metrics

**Asset Class**: The type of security or instrument held by the fund. _Avoid_:
Round

**Share Class**: A class of equity or security issued by a portfolio company.
_Avoid_: Asset class

**Share Type**: The common or preferred classification for a share class.
_Avoid_: Share class when only the common/preferred type is intended

**Price Per Share**: The price assigned to one share within a share class or
financing round. _Avoid_: Original issue price when liquidation preference is
the context

**Financing Round**: A portfolio-company fundraising event, such as Seed, Series
A, or Series B. _Avoid_: Share class

**Financing Event**: The source-data record for a **Financing Round**, including
valuation, round size, closing date, share count, and co-investors. _Avoid_:
Company metric

**Model Stage**: A forecast stage for a portfolio company, with funding,
valuation, graduation, and exit assumptions. _Avoid_: Financing round when the
stage is only a model assumption

**Graduation Timing**: The modeled time it takes for a portfolio company to
advance from one model stage to the next. _Avoid_: Closing date

**Pre-Money Valuation**: The company valuation immediately before a financing
round. _Avoid_: Fair market value

**Round Size**: The total capital raised in a financing round. _Avoid_: Fund
size

**Fully Diluted Shares**: The share count for a company assuming convertible and
exercisable securities are converted or exercised. _Avoid_: Shares held

**Closing Date**: The date a financing round closed. _Avoid_: Investment date
when the fund's purchase date differs

**Co-Investor**: Another investor participating in a financing round. _Avoid_:
Partner

**Lead Investor**: The co-investor identified as leading a financing round.
_Avoid_: General partner unless it is the fund's legal GP

**Investment Date**: The date the fund made the investment. _Avoid_: Vintage
date when discussing a single investment

**Issue Date**: The date a security was issued. _Avoid_: Investment date when
the fund purchase date differs

**Cost Basis**: The remaining invested cost of a holding. _Avoid_: Total value

**Total Cost**: The aggregate capital invested in a holding. _Avoid_: Cost basis
when realized portions matter

**Remaining Value**: The current fair value of the remaining holding. _Avoid_:
Total value

**Fair Market Value**: The current estimated market value of a holding. _Avoid_:
Valuation when referring to current carrying value

**Realization**: A partial or full exit that produces proceeds from an
investment. _Avoid_: Distribution

**Proceeds**: Cash or equivalent received from a realization. _Avoid_:
Distribution when describing investment-level exits

**Security**: An instrument held by a fund in a portfolio company, such as a
certificate, warrant, convertible security, or public equity security. _Avoid_:
Share class

**Certificate**: An equity security representing shares held by a fund. _Avoid_:
Share class

**Warrant**: A security giving the holder the right to buy shares under defined
terms. _Avoid_: Option unless the instrument is actually an option

**Convertible Security**: A security that can convert into equity under defined
terms. _Avoid_: Preferred share unless conversion has occurred

**Public Equity Security**: A security representing publicly traded equity held
by the fund. _Avoid_: Private company investment

**Shares Held**: The number of shares currently held by the fund for a security.
_Avoid_: Fully diluted shares

**Primary Purchase**: A purchase of newly issued shares from the company.
_Avoid_: Secondary purchase

**Secondary Purchase**: A purchase of existing shares from another holder.
_Avoid_: Primary purchase

**Fair Value Inclusion**: A flag indicating whether a share class or security
should be included in fair value calculations. _Avoid_: Fair market value

**Investment Transaction**: An event that changes a security position, such as
an exercise, conversion, or sale. _Avoid_: Financing round

**Transaction Event**: The type of investment transaction that occurred.
_Avoid_: Financing event

**Exercise**: An investment transaction that uses a right, such as a warrant, to
acquire shares. _Avoid_: Conversion

**Conversion**: An investment transaction that changes one security into another
security. _Avoid_: Sale

**Sale Transaction**: An investment transaction that disposes of a security and
produces proceeds. _Avoid_: Realization when a precise transaction event is
needed

**Input Security**: The security being exercised, converted, or sold in an
investment transaction. _Avoid_: End-user copy

**Output Security**: The security created by an exercise or conversion
transaction. _Avoid_: End-user copy

**Investment Amount**: The money invested in a security or investment
transaction. _Avoid_: Proceeds

**Performance Case**: A modeled outcome path for a portfolio company or
investment. _Avoid_: Scenario when the context is a single investment's modeled
outcome

**Default Performance Case**: The initial performance case created for a modeled
investment. _Avoid_: Base case when a base case has not been explicitly
designated

**Case Probability**: The probability assigned to a performance case. _Avoid_:
Ownership percentage

**Exit Timing**: The modeled time until an exit event. _Avoid_: Exit date when
only a duration is modeled

**Exit Valuation**: The modeled company valuation at exit. _Avoid_: Fair market
value when discussing current carrying value

**Unrealized Gain/Loss**: The difference between remaining value and cost basis.
_Avoid_: Realized gain/loss

**Deal IRR**: The internal rate of return for a single investment. _Avoid_: Fund
IRR

## Portfolio Company Operating Language

**Company Metric**: A time-stamped operating or financial measurement for a
portfolio company. _Avoid_: Fund metric

**Metric Category**: The named kind of company metric, such as revenue, ARR,
runway, or headcount. _Avoid_: Metric name when filtering by standardized
category

**Metric Cadence**: The reporting interval for a company metric. _Avoid_:
Reporting period when discussing metric frequency

**Point-in-Time Metric**: A company metric that represents a value as of one
date. _Avoid_: Period metric

**Actual Metric Series**: Historical recorded values for a company metric.
_Avoid_: Projected metric series

**Projected Metric Series**: Forecasted future values for a company metric.
_Avoid_: Actual metric series

**Qualitative Metric**: A descriptive, text-based company metric. _Avoid_:
Numeric metric

**Budget**: A company-level plan used to compare expected and actual metrics.
_Avoid_: Forecast when the plan is approved budget data

**Forecast**: A forward-looking company metric projection. _Avoid_: Budget when
the projection is not an approved plan

**Budget Metric**: A company metric value associated with a budget. _Avoid_:
Actual metric

**Custom Metric**: A firm-defined company metric outside the standard metric
categories. _Avoid_: Custom column

**Custom Column**: A firm-defined portfolio-company field used for
classification, filtering, or workflow context. _Avoid_: Custom metric

**ARR**: Annual Recurring Revenue. _Avoid_: Revenue when subscription recurrence
matters

**Net New ARR**: ARR added after expansion, contraction, churn, reactivation,
and new logo activity. _Avoid_: New logo ARR

**Revenue Growth**: The rate at which revenue changes over time. _Avoid_:
Revenue

**Gross Margin**: Gross profit as a percentage of revenue. _Avoid_: Gross profit

**Net Burn**: Cash outflow net of cash inflow over a period. _Avoid_: Operating
expense

**Burn per FTE**: Net burn divided by headcount. _Avoid_: Net burn

**Runway**: Estimated time remaining before cash is exhausted at the current
burn rate. _Avoid_: Cash in bank

**Cash in Bank**: Cash available to a portfolio company at a point in time.
_Avoid_: Runway

**Headcount**: The number of people employed by a portfolio company. _Avoid_:
FTE when contractor or part-time treatment matters

**Information Request**: A workflow asking a portfolio company to provide data
or documents. _Avoid_: Email request

**Information Report**: A submitted response to an information request. _Avoid_:
Company metric

**Company Document**: A portfolio-company file such as a financial report or
uploaded supporting document. _Avoid_: Information report

**Company Note**: Internal commentary about a portfolio company. _Avoid_:
Company metric

## Benchmark Language

**Benchmark Cohort**: A peer comparison group defined by fund vintage, fund
size, or investment attributes. _Avoid_: Cohort when the benchmark context is
unclear

**Peer Cohort**: A benchmark cohort made up of comparable anonymized funds or
investments. _Avoid_: Cohort when not discussing benchmarks

**Peer Benchmark**: An anonymized comparison against similar funds or
investments. _Avoid_: Target

**Investment Pace**: The rate at which a fund deploys capital over time.
_Avoid_: Performance

**Deployment Rate**: The percentage of fund size deployed by a point in time.
_Avoid_: Investment pace when a precise percentage is needed

**Months Since Vintage**: The number of months elapsed since the fund's first
capital call. _Avoid_: Fund age when benchmarking from first close is intended

**Percentile**: A fund or investment's rank within a benchmark cohort
distribution. _Avoid_: Score

## Partner And Allocation Language

**Partner**: An investor or manager entity with an interest in a fund. _Avoid_:
User

**Limited Partner**: A partner that contributes capital as an investor in the
fund. _Avoid_: Investor when the legal role matters

**General Partner**: A partner that manages or sponsors the fund. _Avoid_:
Manager when the legal role matters

**Partner Class**: A class of partners with shared economic or reporting terms.
_Avoid_: Partner type

**Capital Account**: A partner-level record of commitments, contributions,
distributions, allocations, and NAV. _Avoid_: Account

**Partner Allocation**: The assignment of fund-level line items to partners.
_Avoid_: Allocation cohort

**Allocation Bucket**: A capital-account line item used to classify partner
allocations. _Avoid_: Cohort bucket

**Carried Interest**: The GP's performance-based share of fund profits. _Avoid_:
Management fee

## Cap Table Language

**Summary Cap Table**: A portfolio-company ownership summary by security class.
_Avoid_: Fund ownership table

**Fully Diluted Ownership**: Ownership percentage assuming all convertible and
derivative securities are converted or exercised. _Avoid_: Ownership when
dilution assumptions matter

**Original Issue Price**: The price per share set when a security was issued.
_Avoid_: Share price when liquidation preference is the context

**Liquidation Preference**: The priority economic claim a preferred security has
before common proceeds. _Avoid_: Preference

**Participating Preferred**: Preferred equity that receives its preference and
also participates in remaining proceeds. _Avoid_: Preferred

## Allocation And Economics Language

**Allocation Cohort**: A capital allocation pool with weights, active dates, and
caps. _Avoid_: Cohort

**Exit Cohort Model**: An aggregate exit timing and value progression model used
in fund economics. _Avoid_: Cohort

## Relationships

- **Cohort Analysis** uses **Cohort Definitions** to produce **Analysis
  Cohorts**
- **Cohort** is acceptable in end-user copy; qualified terms are preferred in
  internal/domain discussion
- A **Cohort Definition** produces one or more **Analysis Cohorts**
- A **Cohort Definition** declares exactly one **Cohort Membership Unit**
- A **Fund Vintage Year** is distinct from an investment-level **Cohort Key**
- A **Firm** manages one or more **Funds**
- A **Fund** has one **Fund Reporting Currency** for reported values
- **Fund Size** is the sum of **Capital Commitments**
- A **Fund Model** belongs to one **Fund** but may contain forecast assumptions
  that differ from actual fund records
- **Fund Configuration** sets fund-level assumptions for a **Fund Model**
- **Fund Start Date** anchors **Forecast Period** calculations
- A **Credit Facility** can create interest and unused-fee costs before partner
  capital is called
- **LP Commitment Percentage** and **GP Commitment Percentage** allocate
  **Capital Commitments** by partner role
- **GP Commitment Percentage** can be split into **GP Cash Commitment** and
  **Cashless GP Commitment**
- **Cashless GP Contribution Percentage** determines how much of the GP
  commitment is cashless
- A **Management Fee Waiver** can be associated with **Cashless GP Commitment**
  economics
- **Cashless GP Commitment** is not **Cash in Bank** and is not a cashless
  security exercise
- A **Fund KPI** is a fund-level output, not a **Company Metric**
- A **Dual Forecast** compares **Construction Forecast** against **Current
  Forecast**
- **Construction Forecast** and **Current Forecast** are modeled outputs used
  for variance tracking, not raw actual reporting
- **Construction Forecast** is the planned/pro-forma side of the **Dual
  Forecast**
- **Current Forecast** is the current-portfolio baseline side of the **Dual
  Forecast**
- A **Cash Flow Event** belongs to a **Fund Model** and may reference a
  **Performance Case**
- **Initial Investment**, **Follow-On Investment**, **Dividend**, and **Forecast
  Exit** are cash flow event types
- **Paid-In Capital** is the sum of **Capital Contributions**
- A **Capital Call** can create a **Capital Call Receivable**
- A **Distribution Payable** becomes a **Distribution** when paid
- A **Capital Account** belongs to one **Partner** within one **Fund**
- A **Partner Allocation** posts a fund-level line item to a **Capital Account**
- **Total Value** equals **NAV** plus cumulative **Distributions**
- An **Analysis Cohort** is identified by a **Cohort Key**
- **Company-Level Analysis** and **Investment-Level Analysis** are mutually
  exclusive within a single **Cohort Definition**
- In **Company-Level Analysis**, a company uses the **Cohort Key** of its
  earliest included investment
- In **Company-Level Analysis**, metrics include all included investments for
  the company
- A **Cohort Key Shift** can occur when a company's first historical investment
  is excluded but a later investment is included
- A **Company Exclusion** takes precedence over **Investment Exclusion**
- A **Cohort Bucket** belongs to exactly one **Analysis Cohort** and one
  **Sector Classification**
- **Sector Classification** applies the same way in **Company-Level Analysis**
  and **Investment-Level Analysis**
- An **Unmapped Sector Classification** remains included in analysis
- **TVPI** equals **DPI** plus **RVPI**
- **MOIC** and **TVPI** are distinct because they use different denominators
- **Investment Details** describe **Financing Rounds**, **Share Classes**,
  **Securities**, and **Investment Transactions**
- A **Financing Event** belongs to one **Portfolio Company** and is usually
  displayed to users as a **Financing Round**
- A **Share Class** can belong to a **Financing Round** and has a **Price Per
  Share**
- A **Security** is held by one **Fund** in one **Portfolio Company**
- A **Security** references a **Share Class** and may reference a **Financing
  Round**
- **Primary Purchase** and **Secondary Purchase** are purchase types, not share
  classes
- A **Performance Case** belongs to a modeled **Investment**
- A **Performance Case** has one **Case Probability**
- A **Model Stage** can use **Pre-Money Valuation**, **Round Size**,
  **Graduation Timing**, **Exit Timing**, and **Exit Valuation** assumptions
- An **Investment Transaction** can record an **Exercise**, **Conversion**, or
  **Sale Transaction**
- A **Sale Transaction** produces **Proceeds**
- An **Exercise** or **Conversion** can produce an **Output Security** from an
  **Input Security**
- A **Company Metric** belongs to one **Portfolio Company**
- A **Metric Category** classifies a **Company Metric**
- A **Metric Cadence** describes how often a **Company Metric** is reported
- An **Actual Metric Series** records historical values for a **Company Metric**
- A **Projected Metric Series** forecasts future values for a **Company Metric**
- A **Budget Metric** is distinct from an actual **Company Metric**
- **Custom Metrics** measure time-series company performance; **Custom Columns**
  classify or annotate companies
- **Runway** depends on **Cash in Bank** and **Net Burn**
- An **Information Request** can produce an **Information Report** or **Company
  Document**
- A **Peer Benchmark** compares a fund or investment against a **Peer Cohort**
- **Deployment Rate** measures **Investment Pace** as a percentage of **Fund
  Size**
- A **Realization** produces **Proceeds**
- **Total Value** for an investment includes **Remaining Value** plus
  **Proceeds**
- **Fully Diluted Ownership** belongs to **Summary Cap Table** analysis
- An **Allocation Cohort** is distinct from an **Analysis Cohort**
- An **Exit Cohort Model** is distinct from both an **Analysis Cohort** and an
  **Allocation Cohort**
- **Cohort Analysis** compares performance groupings; an **Exit Cohort Model**
  projects exit timing and value progression

## Example Dialogue

> **Dev:** "When we say this report is grouped by cohort, do we mean the
> analysis grouping or the allocation pool?" **Domain expert:** "Use **Analysis
> Cohort** for the report. An **Allocation Cohort** is for capital allocation
> rules."

> **GP:** "How are we doing versus peers?" **Product:** "Use **Peer Benchmark**
> by **Fund Vintage Year** and **Fund AUM Bucket**, then compare **TVPI**,
> **DPI**, **MOIC**, and **Investment Pace** as of the same **As-Of Date**."

> **GP:** "Is Series A a company metric?" **Product:** "No. Series A is a
> **Financing Round** in **Investment Details**. ARR, runway, and headcount are
> **Company Metrics**."

> **GP:** "What does the probability on this company mean?" **Product:** "That
> is **Case Probability** for a **Performance Case**. It weights a modeled
> outcome path; it is not ownership, confidence in the company, or a benchmark
> percentile."

> **GP:** "Why do I see both construction and current?" **Product:** "That is
> the **Dual Forecast**. **Construction Forecast** shows the planned pro-forma
> fund, while **Current Forecast** shows the current-portfolio baseline."

## Flagged Ambiguities

- Glossary decisions in this file do not create ADRs.
- "Cohort" was used internally to mean **Analysis Cohort**, **Allocation
  Cohort**, and **Exit Cohort Model**. Resolved: bare "Cohort" is acceptable in
  end-user copy but ambiguous in internal/domain discussion.
- The company/investment distinction for **Analysis Cohorts** and the **Unmapped
  Sector Classification** rule are glossary terms, not architecture decisions.
- **Cohort Definition** is internal/domain language, not end-user copy.
- **Fund Vintage Year** was ambiguous between first capital call year and
  establishment year. Resolved: first capital call year is canonical;
  establishment year is only a pre-capital-call fallback.
- Standard Metrics uses investment details for financing events, share classes,
  securities, and transactions. Resolved: these are **Investment Details**,
  distinct from **Company Metrics** and **Fund Performance** metrics.
- The Fund Configuration API source uses `construction` and `current` with
  overlapping descriptions. Resolved: they are the two sides of the **Dual
  Forecast**.
- The Fund Configuration API source uses `cashless` for **Cashless GP
  Commitment** treatment, not cash balance or security exercise.
- API fields such as status code, body, internal IDs, visibility flags, and raw
  arrays are implementation/source-data fields, not glossary terms.
