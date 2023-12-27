import { Allo } from "@allo-team/allo-v2-sdk/";
import { getIPFSClient } from "@/services/ipfs";
import { deployMicrograntsStrategy } from "./microgrants";
import { createProfile } from "./registry";
// import { Allo } from "@allo-team/allo-v2-sdk";

// create an allo instance
export const allo = new Allo({
  chain: 421614,
  rpc: "https://arbitrum-sepolia.blockpi.network/v1/rpc/public",
});

export const createPool = async () => {
  // Create a profile to use as the pool owner/creator
 const profileId ="0x262065cee4b4373cb9c7307f6a64d5d197108d76c01923207a819975bd3fd577";
  /* const profileId = await createProfile();
 */
  // Save metadata to IPFS -> returns a pointer we save on chain for the metadata
  const ipfsClient = getIPFSClient();
  const metadata = {
    profileId: profileId,
    name: "Allo Starter Kit",
    website: "https://allo.gitcoin.co",
    description: "A starter kit for Allo",
    base64Image: "data:image/gif;base64,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", // skipping the image for the demo
  };

  // NOTE: Use this to pin your base64 image to IPFS
   let imagePointer;
 if (metadata.base64Image && metadata.base64Image.includes("base64")) {
    imagePointer = await ipfsClient.pinJSON({
      data: metadata.base64Image,
    });
     metadata.base64Image = imagePointer;
   }

  const pointer = await ipfsClient.pinJSON(metadata);
  console.log("Metadata saved to IPFS with pointer: ", pointer);

  // Deploy the microgrants strategy - `microgrants.ts`
  const poolId = await deployMicrograntsStrategy(pointer, profileId);
  console.log("Pool created with ID: ", poolId);

  return poolId;
};
