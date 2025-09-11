// Test script to verify Step 2 -> Step 3 navigation works
// Run this in the browser console when on the fund-setup page

async function testWizardNavigation() {
    console.log('=== Starting Wizard Navigation Test ===');
    
    // Helper function to fill input
    function fillInput(selector, value) {
        const input = document.querySelector(selector);
        if (input) {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
        return false;
    }
    
    // Helper to click button
    function clickButton(text) {
        const buttons = Array.from(document.querySelectorAll('button'));
        const button = buttons.find(btn => btn.textContent.includes(text));
        if (button) {
            button.click();
            return true;
        }
        return false;
    }
    
    // Helper to wait
    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    try {
        console.log('\n📋 Step 1: Fund Basics');
        console.log('------------------------');
        
        // Fill Step 1 data
        fillInput('input[name="name"]', 'Test Fund 2024') && console.log('✓ Fund name filled');
        fillInput('input[name="totalCommittedCapital"]', '100000000') && console.log('✓ Capital filled: $100M');
        fillInput('input[name="gpCommitmentPercent"]', '2') && console.log('✓ GP commitment: 2%');
        fillInput('input[name="managementFee"]', '2') && console.log('✓ Management fee: 2%');
        fillInput('input[name="carryPercentage"]', '20') && console.log('✓ Carry: 20%');
        fillInput('input[name="fundLife"]', '10') && console.log('✓ Fund life: 10 years');
        fillInput('input[name="investmentPeriod"]', '5') && console.log('✓ Investment period: 5 years');
        
        await wait(1000);
        
        console.log('\n➡️ Clicking Next to go to Step 2...');
        if (clickButton('Next')) {
            console.log('✓ Navigated to Step 2');
        } else {
            console.log('❌ Could not find Next button');
            return;
        }
        
        await wait(2000);
        
        console.log('\n📋 Step 2: Committed Capital');
        console.log('------------------------');
        
        // Check current step
        const h2 = document.querySelector('h2');
        console.log('Current section:', h2?.textContent || 'Unknown');
        
        // Fill any required Step 2 fields
        const step2Inputs = document.querySelectorAll('input[type="number"], input[type="text"]');
        console.log(`Found ${step2Inputs.length} inputs in Step 2`);
        
        await wait(1000);
        
        console.log('\n➡️ CRITICAL TEST: Clicking Next to go to Step 3...');
        console.log('(This is where freezing might occur)');
        
        // Monitor for simulation
        const originalLog = console.log;
        let simulationStarted = false;
        console.log = function(...args) {
            if (args[0]?.includes('[Wizard]')) {
                simulationStarted = true;
            }
            originalLog.apply(console, args);
        };
        
        const startTime = Date.now();
        
        if (clickButton('Next')) {
            console.log('✓ Next button clicked at', new Date().toISOString());
            console.log('⏳ Waiting for navigation...');
            
            // Check for navigation every 500ms for up to 10 seconds
            let navigated = false;
            for (let i = 0; i < 20; i++) {
                await wait(500);
                const currentH2 = document.querySelector('h2');
                if (currentH2?.textContent?.includes('Investment') || 
                    currentH2?.textContent?.includes('Strategy') ||
                    currentH2?.textContent?.includes('Step 3')) {
                    navigated = true;
                    break;
                }
                if (i % 4 === 0) {
                    console.log(`Still waiting... ${(i+1) * 0.5}s`);
                }
            }
            
            const elapsed = Date.now() - startTime;
            
            if (navigated) {
                console.log(`\n✅ SUCCESS: Navigated to Step 3 in ${elapsed}ms`);
                console.log('Current section:', document.querySelector('h2')?.textContent);
                
                if (simulationStarted) {
                    console.log('📊 Simulation was executed during transition');
                } else {
                    console.log('⚡ Simulation was skipped (fast mode)');
                }
            } else {
                console.log(`\n❌ FAILED: Could not navigate to Step 3 after ${elapsed}ms`);
                console.log('Page might be frozen or simulation is taking too long');
                console.log('Current section:', document.querySelector('h2')?.textContent);
            }
            
        } else {
            console.log('❌ Could not find Next button in Step 2');
        }
        
    } catch (error) {
        console.error('Test failed with error:', error);
    }
    
    console.log('\n=== Test Complete ===');
}

// Run the test
testWizardNavigation();

// To skip simulation and test faster, run this first:
// localStorage.setItem('VITE_SKIP_WIZARD_SIMULATION', 'true');
// location.reload();