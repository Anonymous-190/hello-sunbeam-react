import React, { useEffect, useState } from 'react';
import { ethers } from "ethers";
import { contractABI, contractAddress } from '../utils/constants';

export const TransactionContext = React.createContext();

const AMOY_PARAMS = {
  chainId: "0x13882", // 80002 in hex
  chainName: "Polygon Amoy",
  rpcUrls: ["https://rpc-amoy.polygon.technology"],
  nativeCurrency: {
    name: "Polygon POL",
    symbol: "POL",
    decimals: 18,
  },
  blockExplorerUrls: ["https://amoy.polygonscan.com/"],
};

const addAmoyNetwork = async () => {
  try {
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [AMOY_PARAMS],
    });
  } catch (err) {
    console.error("Error adding Amoy network:", err);
  }
};

const createEthereumContract = async () => {
  const { ethereum } = window;
  if (!ethereum) throw new Error("No ethereum object");

  const provider = new ethers.BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  const transactionsContract = new ethers.Contract(contractAddress, contractABI, signer);

  return transactionsContract;
};

export const TransactionProvider = ({ children }) => {
  const [formData, setformData] = useState({ addressTo: '', amount: '', keyword: '', message: '' });
  const [currentAccount, setCurrentAccount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [transactionCount, setTransactionCount] = useState(localStorage.getItem("transactionCount"));
  const [transactions, setTransactions] = useState([]);

  const handleChange = (e, name) => {
    setformData((prevState) => ({ ...prevState, [name]: e.target.value }));
  };

  const getAllTransactions = async () => {
    try {
      const transactionsContract = await createEthereumContract();
      const availableTransactions = await transactionsContract.getAllTransactions();

      const structuredTransactions = availableTransactions.map((tx) => ({
        addressTo: tx.receiver,
        addressFrom: tx.sender,
        timestamp: new Date(Number(tx.timestamp) * 1000).toLocaleString(),
        message: tx.message,
        keyword: tx.keyword,
        amount: parseFloat(ethers.formatEther(tx.amount))
      }));

      setTransactions(structuredTransactions);
    } catch (error) {
      console.log(error);
    }
  };

  const checkIfWalletIsConnect = async () => {
    try {
      const { ethereum } = window;
      if (!ethereum) return alert("Please install MetaMask");

      const chainId = await ethereum.request({ method: "eth_chainId" });
      if (chainId !== AMOY_PARAMS.chainId) {
        await addAmoyNetwork();
      }

      const accounts = await ethereum.request({ method: 'eth_accounts' });
      if (accounts.length) {
        setCurrentAccount(accounts[0]);
        getAllTransactions();
      }
    } catch (error) {
      console.log(error);
    }
  };

  const checkIfTransactionsExists = async () => {
    try {
      const transactionsContract = await createEthereumContract();
      const currentTransactionCount = await transactionsContract.getTransactionCount();
      window.localStorage.setItem("transactionCount", currentTransactionCount.toString());
    } catch (error) {
      console.error("Failed to check transaction count:", error);
    }
  };

  const connectWallet = async () => {
    try {
      const { ethereum } = window;
      if (!ethereum) return alert("Please install MetaMask");

      const chainId = await ethereum.request({ method: "eth_chainId" });
      if (chainId !== AMOY_PARAMS.chainId) {
        await addAmoyNetwork();
      }

      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      setCurrentAccount(accounts[0]);
    } catch (error) {
      console.log(error);
      throw new Error("No ethereum object.");
    }
  };

  const sendTransaction = async () => {
    try {
      const { ethereum } = window;
      if (!ethereum) return alert("Please install MetaMask");

      const { addressTo, amount, keyword, message } = formData;
      const parsedAmount = ethers.parseEther(amount);
      const transactionsContract = await createEthereumContract();

      await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: currentAccount,
          to: addressTo,
          gas: '0x5208',
          value: parsedAmount.toString(),
        }],
      });

      const tx = await transactionsContract.addToBlockchain(addressTo, parsedAmount, message, keyword);
      setIsLoading(true);
      await tx.wait();
      setIsLoading(false);

      const transactionsCount = await transactionsContract.getTransactionCount();
      setTransactionCount(Number(transactionsCount));
      window.localStorage.setItem("transactionCount", transactionsCount.toString());
      getAllTransactions();
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    checkIfWalletIsConnect();
    checkIfTransactionsExists();
  }, []);

  return (
    <TransactionContext.Provider
      value={{
        transactionCount,
        connectWallet,
        transactions,
        currentAccount,
        isLoading,
        sendTransaction,
        handleChange,
        formData,
      }}
    >
      {children}
    </TransactionContext.Provider>
  );
};
