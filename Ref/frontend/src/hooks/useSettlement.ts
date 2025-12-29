import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther, Address } from "viem";
import { SETTLEMENT_CONTRACT_ADDRESS, SETTLEMENT_ABI, ERC20_ABI } from "@/lib/contracts";

// 读取用户余额
export function useBalance(userAddress: Address | undefined, tokenAddress: Address) {
  return useReadContract({
    address: SETTLEMENT_CONTRACT_ADDRESS,
    abi: SETTLEMENT_ABI,
    functionName: "getBalance",
    args: userAddress ? [userAddress, tokenAddress] : undefined,
    query: {
      enabled: !!userAddress,
    },
  });
}

// 读取代币余额 (钱包中)
export function useTokenBalance(userAddress: Address | undefined, tokenAddress: Address) {
  return useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress,
    },
  });
}

// 读取授权额度
export function useAllowance(
  userAddress: Address | undefined,
  tokenAddress: Address,
  spenderAddress: Address
) {
  return useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: userAddress ? [userAddress, spenderAddress] : undefined,
    query: {
      enabled: !!userAddress,
    },
  });
}

// 存款 Hook
export function useDeposit() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const deposit = async (tokenAddress: Address, amount: string) => {
    const amountWei = parseEther(amount);
    writeContract({
      address: SETTLEMENT_CONTRACT_ADDRESS,
      abi: SETTLEMENT_ABI,
      functionName: "deposit",
      args: [tokenAddress, amountWei],
    });
  };

  return {
    deposit,
    isLoading: isPending || isConfirming,
    isSuccess,
    error,
    hash,
  };
}

// 提款 Hook
export function useWithdraw() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const withdraw = async (tokenAddress: Address, amount: string) => {
    const amountWei = parseEther(amount);
    writeContract({
      address: SETTLEMENT_CONTRACT_ADDRESS,
      abi: SETTLEMENT_ABI,
      functionName: "withdraw",
      args: [tokenAddress, amountWei],
    });
  };

  return {
    withdraw,
    isLoading: isPending || isConfirming,
    isSuccess,
    error,
    hash,
  };
}

// 授权 Hook
export function useApprove() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const approve = async (tokenAddress: Address, amount: string) => {
    const amountWei = parseEther(amount);
    writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [SETTLEMENT_CONTRACT_ADDRESS, amountWei],
    });
  };

  return {
    approve,
    isLoading: isPending || isConfirming,
    isSuccess,
    error,
    hash,
  };
}

// 链上下单 Hook (可选，当需要直接链上下单时使用)
export function usePlaceOrderOnChain() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const placeOrder = async (
    marketId: `0x${string}`,
    isBuy: boolean,
    price: string,
    amount: string
  ) => {
    const priceWei = parseEther(price);
    const amountWei = parseEther(amount);
    
    writeContract({
      address: SETTLEMENT_CONTRACT_ADDRESS,
      abi: SETTLEMENT_ABI,
      functionName: "placeOrder",
      args: [marketId, isBuy, priceWei, amountWei],
    });
  };

  return {
    placeOrder,
    isLoading: isPending || isConfirming,
    isSuccess,
    error,
    hash,
  };
}

// 取消订单 Hook
export function useCancelOrderOnChain() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const cancelOrder = async (orderId: `0x${string}`) => {
    writeContract({
      address: SETTLEMENT_CONTRACT_ADDRESS,
      abi: SETTLEMENT_ABI,
      functionName: "cancelOrder",
      args: [orderId],
    });
  };

  return {
    cancelOrder,
    isLoading: isPending || isConfirming,
    isSuccess,
    error,
    hash,
  };
}

