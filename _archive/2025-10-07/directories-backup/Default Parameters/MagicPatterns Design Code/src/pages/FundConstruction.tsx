import React, { useState } from 'react';
import { StepIndicator } from '../components/wizard/StepIndicator';
import { WizardNavigation } from '../components/wizard/WizardNavigation';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { NumericInput } from '../components/ui/NumericInput';
import { PercentInput } from '../components/ui/PercentInput';
import { Button } from '../components/ui/Button';
import { BuildingIcon, CalendarIcon, DollarSignIcon, PercentIcon, InfoIcon, PlusCircleIcon, TargetIcon, CoinsIcon, CalendarDaysIcon, UsersIcon, UserPlusIcon, CheckCircleIcon, ArrowRightIcon, PieChartIcon, TrendingUpIcon, FileTextIcon } from 'lucide-react';
// Define the step structure
const initialSteps = [{
  id: 1,
  name: 'Fund Details',
  status: 'current'
}, {
  id: 2,
  name: 'Fund Size & Fees',
  status: 'upcoming'
}, {
  id: 3,
  name: 'Investment Strategy',
  status: 'upcoming'
}, {
  id: 4,
  name: 'Capital Calls',
  status: 'upcoming'
}, {
  id: 5,
  name: 'LP Structure',
  status: 'upcoming'
}, {
  id: 6,
  name: 'Team & Carry',
  status: 'upcoming'
}, {
  id: 7,
  name: 'Review & Finalize',
  status: 'upcoming'
}];
export const FundConstruction = () => {
  // State for tracking current step
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [steps, setSteps] = useState(initialSteps);
  // Fund Details - Step 1
  const [fundName, setFundName] = useState('');
  const [fundVintage, setFundVintage] = useState('');
  const [fundDescription, setFundDescription] = useState('');
  const [fundLocation, setFundLocation] = useState('');
  // Fund Size & Fees - Step 2
  const [fundSize, setFundSize] = useState('50');
  const [managementFee, setManagementFee] = useState(2);
  const [carryPercentage, setCarryPercentage] = useState(20);
  const [hurdleRate, setHurdleRate] = useState(8);
  const [gpCommitment, setGpCommitment] = useState(1);
  // Investment Strategy - Step 3
  const [minCheckSize, setMinCheckSize] = useState('0.25');
  const [maxCheckSize, setMaxCheckSize] = useState('2');
  const [targetCompanies, setTargetCompanies] = useState('20');
  const [reserveRatio, setReserveRatio] = useState(30);
  const [selectedSectors, setSelectedSectors] = useState({
    saas: true,
    fintech: true,
    healthcare: false,
    consumer: false,
    enterprise: true,
    deeptech: false,
    other: false
  });
  const [selectedStages, setSelectedStages] = useState({
    pre_seed: true,
    seed: true,
    series_a: false,
    series_b: false,
    growth: false
  });
  // Capital Calls - Step 4
  const [fundTerm, setFundTerm] = useState('10');
  const [investmentPeriod, setInvestmentPeriod] = useState('3');
  const [initialCall, setInitialCall] = useState(25);
  const [callSchedule, setCallSchedule] = useState('quarterly');
  const [deploymentTimeline, setDeploymentTimeline] = useState([{
    year: 1,
    percentage: 40
  }, {
    year: 2,
    percentage: 35
  }, {
    year: 3,
    percentage: 25
  }]);
  // LP Structure - Step 5
  const [minInvestment, setMinInvestment] = useState('0.25');
  const [maxLPs, setMaxLPs] = useState('30');
  const [targetLPMix, setTargetLPMix] = useState([{
    type: 'Institutional',
    percentage: 40
  }, {
    type: 'Family Office',
    percentage: 30
  }, {
    type: 'Individual',
    percentage: 20
  }, {
    type: 'Corporate',
    percentage: 10
  }]);
  const [offeringType, setOfferingType] = useState('506b');
  // Team & Carry - Step 6
  const [teamMembers, setTeamMembers] = useState([{
    name: 'Alex Chen',
    role: 'Managing Partner',
    carryPercentage: 40
  }, {
    name: 'Sarah Johnson',
    role: 'General Partner',
    carryPercentage: 30
  }, {
    name: 'Michael Wong',
    role: 'Principal',
    carryPercentage: 20
  }, {
    name: 'Unallocated',
    role: 'Reserve',
    carryPercentage: 10
  }]);
  const [vestingPeriod, setVestingPeriod] = useState('4');
  const [vestingCliff, setVestingCliff] = useState('1');
  // Navigation functions
  const goToNextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      const newSteps = [...steps];
      newSteps[currentStepIndex].status = 'complete';
      newSteps[currentStepIndex + 1].status = 'current';
      setSteps(newSteps);
      setCurrentStepIndex(currentStepIndex + 1);
      window.scrollTo(0, 0);
    }
  };
  const goToPreviousStep = () => {
    if (currentStepIndex > 0) {
      const newSteps = [...steps];
      newSteps[currentStepIndex].status = 'upcoming';
      newSteps[currentStepIndex - 1].status = 'current';
      setSteps(newSteps);
      setCurrentStepIndex(currentStepIndex - 1);
      window.scrollTo(0, 0);
    }
  };
  const saveDraft = () => {
    console.log('Saving draft...');
    // In a real app, you would save to localStorage or backend
    alert('Draft saved successfully!');
  };
  // Render different step content based on currentStepIndex
  const renderStepContent = () => {
    switch (currentStepIndex) {
      case 0:
        return renderFundDetailsStep();
      case 1:
        return renderFundSizeAndFeesStep();
      case 2:
        return renderInvestmentStrategyStep();
      case 3:
        return renderCapitalCallsStep();
      case 4:
        return renderLPStructureStep();
      case 5:
        return renderTeamAndCarryStep();
      case 6:
        return renderReviewStep();
      default:
        return renderFundDetailsStep();
    }
  };
  // Step 1: Fund Details
  const renderFundDetailsStep = () => {
    return <Card title="Basic Fund Details" subtitle="Define the core parameters of your fund">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input id="fund-name" label="Fund Name" placeholder="e.g., Press On Ventures Fund II" value={fundName} onChange={e => setFundName(e.target.value)} required icon={<BuildingIcon size={18} />} />
          <Input id="fund-vintage" label="Fund Vintage" placeholder="e.g., 2023" value={fundVintage} onChange={e => setFundVintage(e.target.value)} required icon={<CalendarIcon size={18} />} helpText="The year the fund makes its first investment" />
        </div>
        <div className="mt-4">
          <Input id="fund-location" label="Primary Geography" placeholder="e.g., San Francisco, CA" value={fundLocation} onChange={e => setFundLocation(e.target.value)} icon={<TargetIcon size={18} />} />
        </div>
        <div className="mt-4">
          <label htmlFor="fund-description" className="block text-sm font-medium text-charcoal mb-1">
            Fund Description
          </label>
          <textarea id="fund-description" rows={4} className="w-full px-3 py-2 border border-lightGray rounded-md focus:outline-none focus:ring-2 focus:ring-beige focus:border-beige" placeholder="Brief description of the fund's focus and thesis..." value={fundDescription} onChange={e => setFundDescription(e.target.value)} />
        </div>
      </Card>;
  };
  // Step 2: Fund Size & Fees
  const renderFundSizeAndFeesStep = () => {
    return <>
        <Card title="Fund Size" subtitle="Define your target fund size and GP commitment">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <NumericInput id="fund-size" label="Target Fund Size" value={fundSize} onChange={setFundSize} prefix="$" suffix="M" required helpText="Target capital to be raised for this fund" />
            <PercentInput id="gp-commitment" label="GP Commitment" value={gpCommitment} onChange={setGpCommitment} min={0} max={10} step={0.25} helpText="Percentage of fund size committed by the GP" />
          </div>
          <div className="mt-4 p-4 bg-beige/10 border border-beige/20 rounded-md flex">
            <div className="mr-3 text-beige">
              <InfoIcon size={20} />
            </div>
            <div>
              <h4 className="font-medium text-charcoal">GP Commitment</h4>
              <p className="text-sm text-charcoal/70">
                The standard GP commitment for venture funds is typically 1-2%
                of the fund size. This demonstrates alignment with LPs and skin
                in the game.
              </p>
            </div>
          </div>
        </Card>
        <Card title="Economics" subtitle="Define management fees and carried interest" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <PercentInput id="management-fee" label="Management Fee" value={managementFee} onChange={setManagementFee} min={0} max={5} step={0.25} required helpText="Annual fee as a percentage of committed capital" />
            <PercentInput id="carry" label="Carried Interest" value={carryPercentage} onChange={setCarryPercentage} min={0} max={30} step={1} required helpText="Percentage of profits allocated to the GP" />
          </div>
          <div className="mt-4">
            <PercentInput id="hurdle" label="Hurdle Rate" value={hurdleRate} onChange={setHurdleRate} min={0} max={20} step={0.5} helpText="Minimum return threshold before carry is earned" />
          </div>
          <div className="mt-6 p-4 bg-beige/10 border border-beige/20 rounded-md flex">
            <div className="mr-3 text-beige">
              <InfoIcon size={20} />
            </div>
            <div>
              <h4 className="font-medium text-charcoal">Industry Benchmark</h4>
              <p className="text-sm text-charcoal/70">
                Standard venture capital economics typically include a 2%
                management fee and 20% carried interest with an 8% hurdle rate.
              </p>
            </div>
          </div>
        </Card>
      </>;
  };
  // Step 3: Investment Strategy
  const renderInvestmentStrategyStep = () => {
    return <>
        <Card title="Investment Focus" subtitle="Define your target sectors and stages">
          <div>
            <label className="block text-sm font-medium text-charcoal mb-3">
              Target Sectors
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries({
              saas: 'SaaS',
              fintech: 'Fintech',
              healthcare: 'Healthcare',
              consumer: 'Consumer',
              enterprise: 'Enterprise',
              deeptech: 'Deep Tech',
              other: 'Other'
            }).map(([key, label]) => <div key={key} className={`border rounded-md p-3 cursor-pointer transition-colors ${selectedSectors[key] ? 'bg-beige/20 border-beige' : 'border-lightGray hover:bg-lightGray/50'}`} onClick={() => setSelectedSectors({
              ...selectedSectors,
              [key]: !selectedSectors[key]
            })}>
                  <div className="flex items-center">
                    <div className={`w-4 h-4 rounded-sm mr-2 flex items-center justify-center ${selectedSectors[key] ? 'bg-charcoal' : 'border border-charcoal/30'}`}>
                      {selectedSectors[key] && <CheckCircleIcon size={12} className="text-white" />}
                    </div>
                    <span>{label}</span>
                  </div>
                </div>)}
            </div>
          </div>
          <div className="mt-6">
            <label className="block text-sm font-medium text-charcoal mb-3">
              Investment Stages
            </label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {Object.entries({
              pre_seed: 'Pre-Seed',
              seed: 'Seed',
              series_a: 'Series A',
              series_b: 'Series B',
              growth: 'Growth'
            }).map(([key, label]) => <div key={key} className={`border rounded-md p-3 cursor-pointer transition-colors ${selectedStages[key] ? 'bg-beige/20 border-beige' : 'border-lightGray hover:bg-lightGray/50'}`} onClick={() => setSelectedStages({
              ...selectedStages,
              [key]: !selectedStages[key]
            })}>
                  <div className="flex items-center">
                    <div className={`w-4 h-4 rounded-sm mr-2 flex items-center justify-center ${selectedStages[key] ? 'bg-charcoal' : 'border border-charcoal/30'}`}>
                      {selectedStages[key] && <CheckCircleIcon size={12} className="text-white" />}
                    </div>
                    <span>{label}</span>
                  </div>
                </div>)}
            </div>
          </div>
        </Card>
        <Card title="Investment Parameters" subtitle="Define check sizes and portfolio construction" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <NumericInput id="min-check" label="Minimum Check Size" value={minCheckSize} onChange={setMinCheckSize} prefix="$" suffix="M" required helpText="Smallest initial investment in a company" />
            <NumericInput id="max-check" label="Maximum Check Size" value={maxCheckSize} onChange={setMaxCheckSize} prefix="$" suffix="M" required helpText="Largest initial investment in a company" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            <NumericInput id="target-companies" label="Target # of Companies" value={targetCompanies} onChange={setTargetCompanies} required helpText="Total number of companies in the portfolio" />
            <PercentInput id="reserve-ratio" label="Follow-on Reserve Ratio" value={reserveRatio} onChange={setReserveRatio} min={0} max={70} step={5} required helpText="Percentage of fund reserved for follow-on investments" />
          </div>
          <div className="mt-6 p-4 bg-beige/10 border border-beige/20 rounded-md">
            <h4 className="font-medium text-charcoal">Portfolio Allocation</h4>
            <div className="mt-2">
              <div className="w-full bg-lightGray rounded-full h-4 overflow-hidden">
                <div className="bg-charcoal h-full" style={{
                width: `${100 - reserveRatio}%`
              }}></div>
              </div>
              <div className="flex justify-between mt-1 text-sm">
                <span>Initial Investments: {100 - reserveRatio}%</span>
                <span>Follow-on Reserve: {reserveRatio}%</span>
              </div>
            </div>
          </div>
        </Card>
      </>;
  };
  // Step 4: Capital Calls
  const renderCapitalCallsStep = () => {
    return <>
        <Card title="Fund Timeline" subtitle="Define the fund's term and investment period">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <NumericInput id="fund-term" label="Fund Term" value={fundTerm} onChange={setFundTerm} suffix="years" required helpText="Total lifespan of the fund" />
            <NumericInput id="investment-period" label="Investment Period" value={investmentPeriod} onChange={setInvestmentPeriod} suffix="years" required helpText="Period for making new investments" />
          </div>
        </Card>
        <Card title="Capital Call Structure" subtitle="Define how capital will be called from LPs" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <PercentInput id="initial-call" label="Initial Capital Call" value={initialCall} onChange={setInitialCall} min={10} max={100} step={5} required helpText="Percentage of committed capital called at first close" />
            <div>
              <label htmlFor="call-schedule" className="block text-sm font-medium text-charcoal mb-1">
                Call Schedule
                <span className="text-red-500 ml-1">*</span>
              </label>
              <select id="call-schedule" value={callSchedule} onChange={e => setCallSchedule(e.target.value)} className="w-full px-3 py-2 border border-lightGray rounded-md focus:outline-none focus:ring-2 focus:ring-beige focus:border-beige">
                <option value="as_needed">As Needed</option>
                <option value="quarterly">Quarterly</option>
                <option value="semi_annually">Semi-Annually</option>
                <option value="annually">Annually</option>
              </select>
              <p className="mt-1 text-sm text-charcoal/70">
                Frequency of capital calls after initial call
              </p>
            </div>
          </div>
        </Card>
        <Card title="Deployment Timeline" subtitle="Projected capital deployment by year" className="mt-6">
          <div className="space-y-4">
            {deploymentTimeline.map((item, index) => <div key={index} className="flex items-center space-x-4">
                <div className="w-24">
                  <span className="text-sm font-medium">Year {item.year}</span>
                </div>
                <div className="flex-1">
                  <PercentInput id={`deployment-year-${item.year}`} value={item.percentage} onChange={value => {
                const newTimeline = [...deploymentTimeline];
                newTimeline[index].percentage = value;
                setDeploymentTimeline(newTimeline);
              }} showSlider={false} className="mb-0" />
                </div>
                <div className="w-16">
                  <span className="text-sm font-mono">{item.percentage}%</span>
                </div>
              </div>)}
          </div>
          <div className="mt-4">
            <div className="w-full bg-lightGray h-8 rounded-md overflow-hidden flex">
              {deploymentTimeline.map((item, index) => <div key={index} className={`h-full flex items-center justify-center text-xs text-white font-medium ${index % 2 === 0 ? 'bg-charcoal' : 'bg-charcoal/70'}`} style={{
              width: `${item.percentage}%`
            }}>
                  {item.percentage}%
                </div>)}
            </div>
            <div className="flex justify-between mt-1 text-xs text-charcoal/70">
              {deploymentTimeline.map((item, index) => <span key={index}>Year {item.year}</span>)}
            </div>
          </div>
          <div className="mt-6 text-sm text-right text-charcoal/70">
            Total:{' '}
            {deploymentTimeline.reduce((sum, item) => sum + item.percentage, 0)}
            %
          </div>
        </Card>
      </>;
  };
  // Step 5: LP Structure
  const renderLPStructureStep = () => {
    return <>
        <Card title="LP Requirements" subtitle="Define minimum investment and LP count">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <NumericInput id="min-investment" label="Minimum LP Investment" value={minInvestment} onChange={setMinInvestment} prefix="$" suffix="M" required helpText="Smallest commitment accepted from an LP" />
            <NumericInput id="max-lps" label="Target Number of LPs" value={maxLPs} onChange={setMaxLPs} required helpText="Maximum number of limited partners" />
          </div>
          <div className="mt-4">
            <label htmlFor="offering-type" className="block text-sm font-medium text-charcoal mb-1">
              Offering Type
              <span className="text-red-500 ml-1">*</span>
            </label>
            <select id="offering-type" value={offeringType} onChange={e => setOfferingType(e.target.value)} className="w-full px-3 py-2 border border-lightGray rounded-md focus:outline-none focus:ring-2 focus:ring-beige focus:border-beige">
              <option value="506b">Rule 506(b)</option>
              <option value="506c">Rule 506(c)</option>
              <option value="other">Other Exemption</option>
            </select>
            <p className="mt-1 text-sm text-charcoal/70">
              Securities offering exemption type
            </p>
          </div>
        </Card>
        <Card title="Target LP Mix" subtitle="Define your ideal LP composition" className="mt-6">
          <div className="space-y-4">
            {targetLPMix.map((item, index) => <div key={index} className="flex items-center space-x-4">
                <div className="w-32">
                  <span className="text-sm font-medium">{item.type}</span>
                </div>
                <div className="flex-1">
                  <PercentInput id={`lp-mix-${index}`} value={item.percentage} onChange={value => {
                const newMix = [...targetLPMix];
                newMix[index].percentage = value;
                setTargetLPMix(newMix);
              }} showSlider={false} className="mb-0" />
                </div>
                <div className="w-16">
                  <span className="text-sm font-mono">{item.percentage}%</span>
                </div>
              </div>)}
          </div>
          <div className="mt-4">
            <div className="w-full bg-lightGray h-8 rounded-md overflow-hidden flex">
              {targetLPMix.map((item, index) => <div key={index} className="h-full flex items-center justify-center text-xs text-white font-medium" style={{
              width: `${item.percentage}%`,
              backgroundColor: ['#292929', '#555555', '#777777', '#999999'][index % 4]
            }}>
                  {item.percentage}%
                </div>)}
            </div>
            <div className="flex justify-between mt-2 text-xs">
              {targetLPMix.map((item, index) => <span key={index} className="text-charcoal/70">
                  {item.type}
                </span>)}
            </div>
          </div>
          <div className="mt-6 text-sm text-right text-charcoal/70">
            Total: {targetLPMix.reduce((sum, item) => sum + item.percentage, 0)}
            %
          </div>
        </Card>
      </>;
  };
  // Step 6: Team & Carry
  const renderTeamAndCarryStep = () => {
    return <>
        <Card title="Team Structure" subtitle="Define your investment team and carry allocation">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-lightGray">
              <thead>
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-charcoal/70 uppercase tracking-wider">
                    Team Member
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-charcoal/70 uppercase tracking-wider">
                    Role
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-charcoal/70 uppercase tracking-wider">
                    Carry Allocation
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-lightGray">
                {teamMembers.map((member, index) => <tr key={index}>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <Input id={`team-name-${index}`} value={member.name} onChange={e => {
                    const newTeam = [...teamMembers];
                    newTeam[index].name = e.target.value;
                    setTeamMembers(newTeam);
                  }} className="mb-0" />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <Input id={`team-role-${index}`} value={member.role} onChange={e => {
                    const newTeam = [...teamMembers];
                    newTeam[index].role = e.target.value;
                    setTeamMembers(newTeam);
                  }} className="mb-0" />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <PercentInput id={`team-carry-${index}`} value={member.carryPercentage} onChange={value => {
                    const newTeam = [...teamMembers];
                    newTeam[index].carryPercentage = value;
                    setTeamMembers(newTeam);
                  }} showSlider={false} className="mb-0" />
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <Button variant="outline" size="sm" icon={<PlusCircleIcon size={16} />} onClick={() => {
            setTeamMembers([...teamMembers, {
              name: '',
              role: '',
              carryPercentage: 0
            }]);
          }}>
              Add Team Member
            </Button>
          </div>
          <div className="mt-6">
            <div className="w-full bg-lightGray h-8 rounded-md overflow-hidden flex">
              {teamMembers.map((member, index) => <div key={index} className="h-full flex items-center justify-center text-xs text-white font-medium" style={{
              width: `${member.carryPercentage}%`,
              backgroundColor: index % 2 === 0 ? '#292929' : '#555555'
            }}>
                  {member.carryPercentage}%
                </div>)}
            </div>
            <div className="mt-2 text-sm text-right text-charcoal/70">
              Total Carry Allocation:{' '}
              {teamMembers.reduce((sum, member) => sum + member.carryPercentage, 0)}
              %
            </div>
          </div>
        </Card>
        <Card title="Carry Vesting" subtitle="Define vesting schedule for carried interest" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <NumericInput id="vesting-period" label="Vesting Period" value={vestingPeriod} onChange={setVestingPeriod} suffix="years" required helpText="Total period for carry to fully vest" />
            <NumericInput id="vesting-cliff" label="Vesting Cliff" value={vestingCliff} onChange={setVestingCliff} suffix="years" required helpText="Period before initial vesting occurs" />
          </div>
          <div className="mt-6 p-4 bg-beige/10 border border-beige/20 rounded-md flex">
            <div className="mr-3 text-beige">
              <InfoIcon size={20} />
            </div>
            <div>
              <h4 className="font-medium text-charcoal">Vesting Structure</h4>
              <p className="text-sm text-charcoal/70">
                Standard carry vesting is typically 4 years with a 1-year cliff,
                similar to startup equity. This encourages long-term commitment
                from the investment team.
              </p>
            </div>
          </div>
        </Card>
      </>;
  };
  // Step 7: Review & Finalize
  const renderReviewStep = () => {
    return <>
        <Card title="Fund Summary" subtitle="Review your fund configuration">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium flex items-center">
                <BuildingIcon size={18} className="mr-2 text-beige" />
                Fund Details
              </h3>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-charcoal/70">Fund Name:</span>
                  <span className="font-medium">
                    {fundName || 'Not specified'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-charcoal/70">Vintage:</span>
                  <span className="font-medium">
                    {fundVintage || 'Not specified'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-charcoal/70">Location:</span>
                  <span className="font-medium">
                    {fundLocation || 'Not specified'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-charcoal/70">Term:</span>
                  <span className="font-medium">{fundTerm} years</span>
                </div>
              </div>
            </div>
            <div className="border-t border-lightGray pt-4">
              <h3 className="text-lg font-medium flex items-center">
                <DollarSignIcon size={18} className="mr-2 text-beige" />
                Economics
              </h3>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-charcoal/70">Fund Size:</span>
                  <span className="font-medium">${fundSize}M</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-charcoal/70">GP Commitment:</span>
                  <span className="font-medium">{gpCommitment}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-charcoal/70">Management Fee:</span>
                  <span className="font-medium">{managementFee}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-charcoal/70">Carried Interest:</span>
                  <span className="font-medium">{carryPercentage}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-charcoal/70">Hurdle Rate:</span>
                  <span className="font-medium">{hurdleRate}%</span>
                </div>
              </div>
            </div>
            <div className="border-t border-lightGray pt-4">
              <h3 className="text-lg font-medium flex items-center">
                <TargetIcon size={18} className="mr-2 text-beige" />
                Investment Strategy
              </h3>
              <div className="mt-2 text-sm">
                <div className="flex justify-between mb-2">
                  <span className="text-charcoal/70">Check Size Range:</span>
                  <span className="font-medium">
                    ${minCheckSize}M - ${maxCheckSize}M
                  </span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-charcoal/70">Target Companies:</span>
                  <span className="font-medium">{targetCompanies}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-charcoal/70">Follow-on Reserve:</span>
                  <span className="font-medium">{reserveRatio}%</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-charcoal/70">Sectors:</span>
                  <span className="font-medium">
                    {Object.entries(selectedSectors).filter(([_, isSelected]) => isSelected).map(([key, _]) => key.charAt(0).toUpperCase() + key.slice(1)).join(', ')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-charcoal/70">Stages:</span>
                  <span className="font-medium">
                    {Object.entries(selectedStages).filter(([_, isSelected]) => isSelected).map(([key, _]) => key.replace('_', ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')).join(', ')}
                  </span>
                </div>
              </div>
            </div>
            <div className="border-t border-lightGray pt-4">
              <h3 className="text-lg font-medium flex items-center">
                <UsersIcon size={18} className="mr-2 text-beige" />
                LP Structure
              </h3>
              <div className="mt-2 text-sm">
                <div className="flex justify-between mb-2">
                  <span className="text-charcoal/70">Minimum Investment:</span>
                  <span className="font-medium">${minInvestment}M</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-charcoal/70">Target LP Count:</span>
                  <span className="font-medium">{maxLPs}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-charcoal/70">Offering Type:</span>
                  <span className="font-medium">
                    Rule {offeringType.toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-charcoal/70">
                    Initial Capital Call:
                  </span>
                  <span className="font-medium">{initialCall}%</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-8 p-4 bg-beige/10 border border-beige/20 rounded-md">
            <h4 className="font-medium text-charcoal flex items-center">
              <FileTextIcon size={18} className="mr-2 text-beige" />
              Next Steps
            </h4>
            <p className="text-sm text-charcoal/70 mt-2">
              Your fund model is now complete. You can now:
            </p>
            <ul className="mt-2 space-y-2 text-sm">
              <li className="flex items-center">
                <ArrowRightIcon size={14} className="mr-2 text-beige" />
                Generate legal documents based on this model
              </li>
              <li className="flex items-center">
                <ArrowRightIcon size={14} className="mr-2 text-beige" />
                Export the model to share with potential LPs
              </li>
              <li className="flex items-center">
                <ArrowRightIcon size={14} className="mr-2 text-beige" />
                Begin setting up your fund administration
              </li>
            </ul>
          </div>
        </Card>
        <div className="mt-6 flex justify-center">
          <Button variant="primary" size="lg" icon={<CheckCircleIcon size={18} />}>
            Finalize Fund Model
          </Button>
        </div>
      </>;
  };
  return <div>
      <div>
        <h1 className="text-2xl font-inter font-bold text-charcoal">
          Fund Construction Wizard
        </h1>
        <p className="text-charcoal/70 mt-1">
          Configure your fund parameters step by step
        </p>
      </div>
      <div className="mt-8">
        <StepIndicator steps={steps} currentStep={currentStepIndex + 1} />
        {renderStepContent()}
        <WizardNavigation onNext={goToNextStep} onPrevious={goToPreviousStep} onSave={saveDraft} isFirstStep={currentStepIndex === 0} isLastStep={currentStepIndex === steps.length - 1} />
      </div>
    </div>;
};