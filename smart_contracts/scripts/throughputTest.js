const { ethers } = require("ethers");
require("dotenv").config();
const fs = require("fs");
const path = require("path");

async function main() {
  // ✅ Compatible with ethers v5
  const provider = new ethers.providers.JsonRpcProvider(process.env.ALCHEMY_API_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const contractAddress = "0xF09988D11E3eBFb4DD63964308e317250F275B20"; // ✅ Deployed on Amoy
  const abiPath = path.join(__dirname, "../artifacts/contracts/Transactions.sol/Transactions.json");
  const contractABI = JSON.parse(fs.readFileSync(abiPath)).abi;
  const contract = new ethers.Contract(contractAddress, contractABI, wallet);

  // First, let's check if we have sufficient balance
  const balanceWei = await wallet.getBalance();
  const balance = ethers.utils.formatEther(balanceWei);
  console.log(`💰 Wallet balance: ${balance} MATIC`);
  
  if (balanceWei.lt(ethers.utils.parseEther("0.1"))) {
    console.warn("⚠️ Warning: Low balance may cause transaction failures");
  }

  // Check if the contract exists
  const contractCode = await provider.getCode(contractAddress);
  if (contractCode === "0x") {
    console.error(`❌ Contract not found at ${contractAddress}`);
    return;
  }
  console.log(`✅ Contract verified at ${contractAddress}`);

  // Try a test call first to verify everything works
  try {
    // Call view function if available, or estimate gas for a transaction
    const gasEstimate = await contract.estimateGas.addToBlockchain(
      "0xf04E175Ab8B608BA3e464D5f9d1Db020d20Fd115",
      ethers.utils.parseEther("0.0001"),
      "Test Call",
      "test"
    );
    console.log(`✅ Contract method call successful, estimated gas: ${gasEstimate.toString()}`);
  } catch (err) {
    console.error("❌ Contract test call failed:", err.message);
    console.log("\nDebugging contract interaction...");
    
    // Try to determine what might be causing the issue
    try {
      // Get contract interface
      const contractInterface = new ethers.utils.Interface(contractABI);
      console.log("Contract methods:", 
        contractInterface.fragments
          .filter(f => f.type === "function")
          .map(f => `${f.name}(${f.inputs.map(i => i.type).join(',')})`));
    } catch (err) {
      console.error("Error analyzing contract:", err.message);
    }
    
    return;
  }

  const numTransactions = 20;
  let successCount = 0;
  let totalGasUsed = ethers.BigNumber.from("0");

  // Set gas params correctly for Polygon Amoy
  const maxPriorityFeePerGas = ethers.utils.parseUnits("30", "gwei"); // Required minimum is 25 gwei
  const maxFeePerGas = ethers.utils.parseUnits("50", "gwei");
  const gasLimit = 500000; // Increased gas limit

  console.log(`🚀 Sending ${numTransactions} transactions to Polygon Amoy...`);
  console.log(`💰 Using maxPriorityFeePerGas: ${ethers.utils.formatUnits(maxPriorityFeePerGas, "gwei")} gwei`);
  console.log(`💰 Using maxFeePerGas: ${ethers.utils.formatUnits(maxFeePerGas, "gwei")} gwei`);
  console.log(`⛽ Using gasLimit: ${gasLimit}`);

  const start = Date.now();

  for (let i = 0; i < numTransactions; i++) {
    try {
      console.log(`Preparing transaction ${i + 1}...`);
      
      // Get nonce manually to avoid nonce conflicts
      const nonce = await wallet.getTransactionCount("pending");
      console.log(`Using nonce: ${nonce}`);
      
      const tx = await contract.addToBlockchain(
        "0xf04E175Ab8B608BA3e464D5f9d1Db020d20Fd115", // Test receiver
        ethers.utils.parseEther("0.0001"),
        `Load Test ${i + 1}`,
        "test",
        {
          maxPriorityFeePerGas,
          maxFeePerGas,
          gasLimit,
          nonce
        }
      );

      console.log(`Transaction sent: ${tx.hash}`);
      console.log(`Waiting for confirmation...`);
      
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        totalGasUsed = totalGasUsed.add(receipt.gasUsed);
        console.log(`✅ Tx ${i + 1}: ${tx.hash} (${receipt.gasUsed.toString()} gas used)`);
        successCount++;
      } else {
        console.error(`❌ Tx ${i + 1} failed with status 0`);
        
        // Try to get more details using trace API if available
        try {
          const trace = await provider.send("debug_traceTransaction", [tx.hash]);
          console.log("Transaction trace:", JSON.stringify(trace, null, 2));
        } catch (traceErr) {
          console.log("Trace not available:", traceErr.message);
        }
      }
    } catch (err) {
      console.error(`❌ Tx ${i + 1} failed:`, err.message);
      
      // Extract the revert reason if possible
      if (err.data) {
        try {
          const decodedError = contract.interface.parseError(err.data);
          console.log("Decoded error:", decodedError);
        } catch (decodeErr) {
          console.log("Could not decode error data");
        }
      }
    }

    // Add a longer delay between transactions
    console.log(`Waiting before next transaction...`);
    await new Promise(res => setTimeout(res, 2000));
  }

  const duration = (Date.now() - start) / 1000;
  const avgGas = successCount ? totalGasUsed.div(successCount) : ethers.BigNumber.from("0");
  const TPS = (successCount / duration).toFixed(2);

  console.log("\n📊 Test Results:");
  console.log(`  ✅ Success: ${successCount}/${numTransactions}`);
  console.log(`  ⚡ TPS: ${TPS}`);
  console.log(`  ⛽ Avg Gas Used: ${avgGas.toString()}`);
}

main().catch(err => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});