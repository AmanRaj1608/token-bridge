import spl20 from "./solana/spl20.json";
import erc20 from "./evm/erc20.json";

export const getSpl20Program = () => {
  return spl20;
};

export const getErc20Abi = () => {
  return erc20.abi;
};
