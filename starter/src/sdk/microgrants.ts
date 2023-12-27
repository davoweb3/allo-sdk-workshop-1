import { MicroGrantsABI } from "@/abi/Microgrants";
import { TNewApplication } from "@/app/types";
import { getIPFSClient } from "@/services/ipfs";
import { wagmiConfigData } from "@/services/wagmi";
import { StrategyType } from "@allo-team/allo-v2-sdk/dist/strategies/MicroGrantsStrategy/types";
import {
  NATIVE,
  ethereumHashRegExp,
  extractLogByEventName,
  getEventValues,
  pollUntilDataIsIndexed,
  pollUntilMetadataIsAvailable,
} from "@/utils/common";
import { checkIfRecipientIsIndexedQuery } from "@/utils/query";
import { getProfileById } from "@/utils/request";
import { MicroGrantsStrategy } from "@allo-team/allo-v2-sdk";
import { CreatePoolArgs } from "@allo-team/allo-v2-sdk/dist/Allo/types";

import {
  TransactionData,
  ZERO_ADDRESS,
} from "@allo-team/allo-v2-sdk/dist/Common/types";
import {
  Allocation,
  SetAllocatorData,
} from "@allo-team/allo-v2-sdk/dist/strategies/MicroGrantsStrategy/types";
import {
  getWalletClient,
  sendTransaction,
  waitForTransaction,
} from "@wagmi/core";
import { decodeEventLog } from "viem";
import { allo } from "./allo";

export const strategy = new MicroGrantsStrategy({
  chain: 421614,
  rpc: "https://arbitrum-sepolia.blockpi.network/v1/rpc/public",

});

const strategyType = StrategyType.MicroGrants;
const deployParams = strategy.getDeployParams(strategyType);

export const deployMicrograntsStrategy = async (
  pointer: any,
  profileId: string
) => {
  const walletClient = await getWalletClient({ chainId: 421614 });

  let strategyAddress = "0xc0379c3E6e3140caE35588c09e081F2d8529C7E3";
  let initStrategyData;

  try {
    const hash = await walletClient!.deployContract({
      abi: deployParams.abi,
      bytecode: deployParams.bytecode as `0x${string}`,
      args: [],
    });

    const result = await waitForTransaction({ hash: hash, chainId: 421614 });
    strategyAddress = result.contractAddress!;

    const startDateInSeconds = Math.floor(new Date().getTime() / 1000) + 300;
    const endDateInSeconds = Math.floor(new Date().getTime() / 1000) + 10000;

    const initParams: any = {
      useRegistryAnchor: true,
      allocationStartTime: BigInt(startDateInSeconds),
      allocationEndTime: BigInt(endDateInSeconds),
      approvalThreshold: BigInt(1),
      maxRequestedAmount: BigInt(1e13),
    };

    initStrategyData = await strategy.getInitializeData(initParams);
  } catch (e) {
    console.error("Deploying Strategy", e);
  }

  const poolCreationData: CreatePoolArgs = {
    profileId: profileId,
    strategy: strategyAddress,
    initStrategyData: initStrategyData,
    token: NATIVE,
    amount: BigInt(1e14),
    metadata: {
      protocol: BigInt(1),
      pointer: pointer.IpfsHash,
    },
    managers: ["0x988Dd08C548d396A754649D998B4D5225C682B62"],
  };

  const txData: TransactionData = allo.createPool(poolCreationData);

  try {
    const hash = await sendTransaction({
      data: txData.data,
      to: txData.to,
      value: BigInt(txData.value),
    });

    console.log(`Transaction hash: ${hash}`);

  /*   const tx = await sendTransaction({
      to: txData.to as string,
      data: txData.data,
      value: BigInt(txData.value),
    }); */

    const receipt = await wagmiConfigData.publicClient.waitForTransactionReceipt({
      hash: tx.hash,
      confirmations: 2,
    });

    const logValues = getEventValues(receipt, MicroGrantsABI, "Initialized");

    let poolId = -1;
    if (logValues.poolId) poolId = Number(logValues.poolId);

    setTimeout(() => {}, 5000);

    return {
      address: strategyAddress as `0x${string}`,
      poolId: poolId,
    };
  } catch (e) {
    console.error("Creating Pool", e);
  }
};

// The rest of your code remains unchanged

// Rest of the code for batchSetAllocator, createApplication, and allocate functions remains unchanged.



export const batchSetAllocator = async (data: SetAllocatorData[]) => {
  if (strategy) {
    const strategyAddress = await allo.getStrategy(3);
    console.log("strategyAddress", strategyAddress);

    // Set the contract address -> docs: 
    strategy.setContract(strategyAddress as `0x${string}`);
    const txData: TransactionData = strategy.getBatchSetAllocatorData(data);

    console.log("txData", txData);

    try {
      const tx = await sendTransaction({
        to: txData.to as string,
        data: txData.data,
        value: BigInt(txData.value),
      });

      await wagmiConfigData.publicClient.waitForTransactionReceipt({
        hash: tx.hash,
      });

      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (e) {
      console.log("Updating Allocators", e);
    }
  }
};

export const createApplication = async (
  data: TNewApplication,
  chain: number,
  poolId: number
): Promise<string> => {
  if (chain !== 421614) return "0x";

  // Set some allocators for demo
  // NOTE: Import type from SDK - SetAllocatorData[]
  const allocatorData: SetAllocatorData[] = [
    {
      allocatorAddress: "0x988Dd08C548d396A754649D998B4D5225C682B62",
      flag: true,
    },
  ];

  // todo: set the allocators defined above
  await batchSetAllocator(allocatorData);

  console.log("Allocators set");

  // const chainInfo: any | unknown = getChain(chain);
  let profileId = data.profileId;

  // 2. Save metadata to IPFS
  const ipfsClient = getIPFSClient();

  const metadata = {
    name: data.name,
    website: data.website,
    description: data.description,
    email: data.email,
    base64Image: data.base64Image,
  };

  let imagePointer;
  let pointer;

  try {
    if (metadata.base64Image.includes("base64")) {
      imagePointer = await ipfsClient.pinJSON({
        data: metadata.base64Image,
      });
      metadata.base64Image = imagePointer.IpfsHash;
    }

    pointer = await ipfsClient.pinJSON(metadata);

    console.log("Metadata saved to IPFS with pointer: ", pointer);
  } catch (e) {
    console.error("IPFS", e);
  }

  // 3. Register application to pool
  let recipientId;
  const strategy = new MicroGrantsStrategy({
    chain,
    rpc: "https://arbitrum-sepolia.blockpi.network/v1/rpc/public",
    poolId,
  });
  let anchorAddress: string = ZERO_ADDRESS;

  // Get the anchor address for the profileId
  if (ethereumHashRegExp.test(profileId || "")) {
    anchorAddress = (
      await getProfileById({
        chainId: chain.toString(),
        profileId: profileId!.toLowerCase(),
      })
    ).anchor;
  }

  console.log("anchorAddress", anchorAddress);

  // todo: snippet => getRegisterRecipientData

  const registerRecipientData = strategy.getRegisterRecipientData({
    registryAnchor: anchorAddress as `0x${string}`,
    recipientAddress: "0x988Dd08C548d396A754649D998B4D5225C682B62", // data.recipientAddress as `0x${string}`,
    requestedAmount: BigInt(1e13), // data.requestedAmount,
    metadata: {
      protocol: BigInt(1),
      pointer: pointer.IpfsHash,
    },
  });

  console.log("registerRecipientData", registerRecipientData);

  try {
    const tx = await sendTransaction({
      to: registerRecipientData.to as string,
      data: registerRecipientData.data,
      value: BigInt(registerRecipientData.value),
    });

    const reciept =
      await wagmiConfigData.publicClient.waitForTransactionReceipt({
        hash: tx.hash,
      });

    const { logs } = reciept;
    const decodedLogs = logs.map((log) =>
      decodeEventLog({ ...log, abi: MicroGrantsABI })
    );

    let log = extractLogByEventName(decodedLogs, "Registered");
    if (!log) {
      log = extractLogByEventName(decodedLogs, "UpdatedRegistration");
    }

    recipientId = log.args["recipientId"].toLowerCase();
  } catch (e) {
    console.error("Error Registering Application", e);
  }

  // 4. Poll indexer for recipientId
  const pollingData: any = {
    chainId: chain,
    poolId: poolId,
    recipientId: recipientId.toLowerCase(),
  };
  const pollingResult: boolean = await pollUntilDataIsIndexed(
    checkIfRecipientIsIndexedQuery,
    pollingData,
    "microGrantRecipient"
  );

  if (pollingResult) {
    // do something with result...
  } else {
    console.error("Polling ERROR");
  }

  // 5. Index Metadata
  const pollingMetadataResult = await pollUntilMetadataIsAvailable(
    pointer.IpfsHash
  );

  if (pollingMetadataResult) {
    // do something with result...
  } else {
    console.error("Polling ERROR");
  }

  await new Promise((resolve) => setTimeout(resolve, 3000));

  return recipientId;
};

export const allocate = async (data: Allocation) => {
  if (strategy) {
    // const chainInfo: any | unknown = getChain(421614);

    strategy.setPoolId(1);
    const txData: TransactionData = strategy.getAllocationData(
      data.recipientId,
      data.status
    );

    try {
      const tx = await sendTransaction({
        to: txData.to as string,
        data: txData.data,
        value: BigInt(txData.value),
      });

      await wagmiConfigData.publicClient.waitForTransactionReceipt({
        hash: tx.hash,
      });

      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (e) {
      console.log("Allocating", e);
    }
  }
};
