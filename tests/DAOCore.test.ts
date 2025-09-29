import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV, asciiCV, optionalCV, tupleCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_PROPOSAL_ALREADY_EXISTS = 101;
const ERR_PROPOSAL_NOT_FOUND = 102;
const ERR_VOTING_CLOSED = 103;
const ERR_ALREADY_VOTED = 104;
const ERR_QUORUM_NOT_REACHED = 105;
const ERR_INVALID_PROPOSAL_DURATION = 106;
const ERR_INVALID_QUORUM_THRESHOLD = 107;
const ERR_INVALID_PROPOSAL_TYPE = 108;
const ERR_INVALID_DESCRIPTION = 109;
const ERR_INVALID_VOTE = 110;
const ERR_NOT_TOKEN_HOLDER = 111;
const ERR_INSUFFICIENT_BALANCE = 112;
const ERR_PROPOSAL_EXECUTED = 113;
const ERR_AUTHORITY_NOT_SET = 114;
const ERR_INVALID_TIMESTAMP = 115;
const ERR_MAX_PROPOSALS_EXCEEDED = 116;
const ERR_INVALID_RULE_CHANGE = 117;
const ERR_INVALID_REWARD_AMOUNT = 118;
const ERR_INVALID_ZONE = 119;
const ERR_INVALID_STATUS = 120;

interface Proposal {
  title: string;
  description: string;
  proposer: string;
  startHeight: number;
  endHeight: number;
  proposalType: string;
  ruleChange: string | null;
  rewardAmount: number | null;
  zone: string | null;
  yesVotes: number;
  noVotes: number;
  executed: boolean;
  status: string;
}

type Result<T> = { ok: boolean; value: T };

class DAOCoreMock {
  state: {
    nextProposalId: number;
    maxProposals: number;
    proposalDuration: number;
    quorumThreshold: number;
    governanceTokenContract: string;
    executorContract: string | null;
    proposals: Map<number, Proposal>;
    votes: Map<string, boolean>;
    proposalByTitle: Map<string, number>;
  } = {
    nextProposalId: 0,
    maxProposals: 1000,
    proposalDuration: 144,
    quorumThreshold: 51,
    governanceTokenContract: "SP000000000000000000002Q6VF78",
    executorContract: null,
    proposals: new Map(),
    votes: new Map(),
    proposalByTitle: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  tokenBalances: Map<string, number> = new Map([["ST1TEST", 1000]]);
  executedProposals: Set<number> = new Set();

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextProposalId: 0,
      maxProposals: 1000,
      proposalDuration: 144,
      quorumThreshold: 51,
      governanceTokenContract: "SP000000000000000000002Q6VF78",
      executorContract: null,
      proposals: new Map(),
      votes: new Map(),
      proposalByTitle: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.tokenBalances = new Map([["ST1TEST", 1000]]);
    this.executedProposals = new Set();
  }

  getBalance(who: string): number {
    return this.tokenBalances.get(who) || 0;
  }

  setExecutorContract(contract: string): Result<boolean> {
    if (this.caller !== "ST1TEST") return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.executorContract = contract;
    return { ok: true, value: true };
  }

  setProposalDuration(newDur: number): Result<boolean> {
    if (this.caller !== "ST1TEST") return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newDur <= 0 || newDur > 10080) return { ok: false, value: ERR_INVALID_PROPOSAL_DURATION };
    this.state.proposalDuration = newDur;
    return { ok: true, value: true };
  }

  setQuorumThreshold(newQ: number): Result<boolean> {
    if (this.caller !== "ST1TEST") return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newQ < 1 || newQ > 100) return { ok: false, value: ERR_INVALID_QUORUM_THRESHOLD };
    this.state.quorumThreshold = newQ;
    return { ok: true, value: true };
  }

  createProposal(
    title: string,
    description: string,
    ptype: string,
    ruleChange: string | null,
    rewardAmount: number | null,
    zone: string | null
  ): Result<number> {
    if (this.state.nextProposalId >= this.state.maxProposals) return { ok: false, value: ERR_MAX_PROPOSALS_EXCEEDED };
    if (!title || title.length > 100) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (!description || description.length > 500) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (!["rule-change", "reward-dist", "zone-update"].includes(ptype)) return { ok: false, value: ERR_INVALID_PROPOSAL_TYPE };
    if (ruleChange && ruleChange.length > 200) return { ok: false, value: ERR_INVALID_RULE_CHANGE };
    if (rewardAmount && rewardAmount <= 0) return { ok: false, value: ERR_INVALID_REWARD_AMOUNT };
    if (zone && zone.length > 50) return { ok: false, value: ERR_INVALID_ZONE };
    if (this.getBalance(this.caller) <= 0) return { ok: false, value: ERR_NOT_TOKEN_HOLDER };
    if (this.state.proposalByTitle.has(title)) return { ok: false, value: ERR_PROPOSAL_ALREADY_EXISTS };

    const id = this.state.nextProposalId;
    const proposal: Proposal = {
      title,
      description,
      proposer: this.caller,
      startHeight: this.blockHeight,
      endHeight: this.blockHeight + this.state.proposalDuration,
      proposalType: ptype,
      ruleChange,
      rewardAmount,
      zone,
      yesVotes: 0,
      noVotes: 0,
      executed: false,
      status: "active",
    };
    this.state.proposals.set(id, proposal);
    this.state.proposalByTitle.set(title, id);
    this.state.nextProposalId++;
    return { ok: true, value: id };
  }

  voteOnProposal(id: number, vote: boolean): Result<boolean> {
    const prop = this.state.proposals.get(id);
    if (!prop) return { ok: false, value: ERR_PROPOSAL_NOT_FOUND };
    if (this.blockHeight > prop.endHeight || prop.executed) return { ok: false, value: ERR_VOTING_CLOSED };
    const voteKey = `${id}-${this.caller}`;
    if (this.state.votes.has(voteKey)) return { ok: false, value: ERR_ALREADY_VOTED };
    const balance = this.getBalance(this.caller);
    if (balance <= 0) return { ok: false, value: ERR_NOT_TOKEN_HOLDER };
    if (balance <= 0) return { ok: false, value: ERR_INSUFFICIENT_BALANCE };

    this.state.votes.set(voteKey, vote);
    if (vote) {
      prop.yesVotes += balance;
    } else {
      prop.noVotes += balance;
    }
    this.state.proposals.set(id, prop);
    return { ok: true, value: true };
  }

  executeProposal(id: number): Result<boolean> {
    const prop = this.state.proposals.get(id);
    if (!prop) return { ok: false, value: ERR_PROPOSAL_NOT_FOUND };
    if (this.blockHeight <= prop.endHeight) return { ok: false, value: ERR_VOTING_CLOSED };
    if (prop.executed) return { ok: false, value: ERR_PROPOSAL_EXECUTED };
    const totalVotes = prop.yesVotes + prop.noVotes;
    const quorum = (totalVotes * this.state.quorumThreshold) / 100;
    if (prop.yesVotes < quorum) return { ok: false, value: ERR_QUORUM_NOT_REACHED };
    if (!this.state.executorContract) return { ok: false, value: ERR_AUTHORITY_NOT_SET };

    prop.executed = true;
    prop.status = "executed";
    this.state.proposals.set(id, prop);
    this.executedProposals.add(id);
    return { ok: true, value: true };
  }

  getProposalCount(): Result<number> {
    return { ok: true, value: this.state.nextProposalId };
  }

  checkProposalExistence(title: string): Result<boolean> {
    return { ok: true, value: this.state.proposalByTitle.has(title) };
  }
}

describe("DAOCore", () => {
  let contract: DAOCoreMock;

  beforeEach(() => {
    contract = new DAOCoreMock();
    contract.reset();
  });

  it("creates a proposal successfully", () => {
    const result = contract.createProposal(
      "Protect Zone A",
      "Increase no-take area",
      "rule-change",
      "Update fishing limits",
      null,
      "Zone A"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const prop = contract.state.proposals.get(0);
    expect(prop?.title).toBe("Protect Zone A");
    expect(prop?.description).toBe("Increase no-take area");
    expect(prop?.proposalType).toBe("rule-change");
    expect(prop?.ruleChange).toBe("Update fishing limits");
    expect(prop?.zone).toBe("Zone A");
    expect(prop?.yesVotes).toBe(0);
    expect(prop?.noVotes).toBe(0);
    expect(prop?.executed).toBe(false);
    expect(prop?.status).toBe("active");
  });

  it("rejects duplicate proposal titles", () => {
    contract.createProposal(
      "Protect Zone A",
      "Increase no-take area",
      "rule-change",
      "Update fishing limits",
      null,
      "Zone A"
    );
    const result = contract.createProposal(
      "Protect Zone A",
      "Different description",
      "zone-update",
      null,
      100,
      "Zone B"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PROPOSAL_ALREADY_EXISTS);
  });

  it("rejects proposal creation without tokens", () => {
    contract.tokenBalances.set("ST1TEST", 0);
    const result = contract.createProposal(
      "No Tokens",
      "Test proposal",
      "rule-change",
      null,
      null,
      null
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_TOKEN_HOLDER);
  });

  it("allows voting on active proposal", () => {
    contract.createProposal(
      "Vote Test",
      "Test voting",
      "rule-change",
      null,
      null,
      null
    );
    const result = contract.voteOnProposal(0, true);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const prop = contract.state.proposals.get(0);
    expect(prop?.yesVotes).toBe(1000);
  });

  it("rejects double voting", () => {
    contract.createProposal(
      "Double Vote",
      "Test double vote",
      "rule-change",
      null,
      null,
      null
    );
    contract.voteOnProposal(0, true);
    const result = contract.voteOnProposal(0, false);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_VOTED);
  });

  it("executes proposal successfully", () => {
    contract.setExecutorContract("ST2EXEC");
    contract.createProposal(
      "Execute Test",
      "Test execution",
      "rule-change",
      null,
      null,
      null
    );
    contract.voteOnProposal(0, true);
    contract.blockHeight = 145;
    const result = contract.executeProposal(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const prop = contract.state.proposals.get(0);
    expect(prop?.executed).toBe(true);
    expect(prop?.status).toBe("executed");
  });

  it("rejects execution without quorum", () => {
    contract.setExecutorContract("ST2EXEC");
    contract.createProposal(
      "No Quorum",
      "Test no quorum",
      "rule-change",
      null,
      null,
      null
    );
    contract.tokenBalances.set("ST1TEST", 500);
    contract.voteOnProposal(0, false);
    contract.blockHeight = 145;
    const result = contract.executeProposal(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_QUORUM_NOT_REACHED);
  });

  it("rejects execution before end", () => {
    contract.setExecutorContract("ST2EXEC");
    contract.createProposal(
      "Early Execute",
      "Test early",
      "rule-change",
      null,
      null,
      null
    );
    contract.voteOnProposal(0, true);
    contract.blockHeight = 100;
    const result = contract.executeProposal(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_VOTING_CLOSED);
  });

  it("rejects execution without executor", () => {
    contract.createProposal(
      "No Executor",
      "Test no executor",
      "rule-change",
      null,
      null,
      null
    );
    contract.voteOnProposal(0, true);
    contract.blockHeight = 145;
    const result = contract.executeProposal(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_SET);
  });

  it("sets proposal duration successfully", () => {
    const result = contract.setProposalDuration(288);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.proposalDuration).toBe(288);
  });

  it("rejects invalid proposal duration", () => {
    const result = contract.setProposalDuration(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PROPOSAL_DURATION);
  });

  it("sets quorum threshold successfully", () => {
    const result = contract.setQuorumThreshold(60);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.quorumThreshold).toBe(60);
  });

  it("rejects invalid quorum threshold", () => {
    const result = contract.setQuorumThreshold(101);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_QUORUM_THRESHOLD);
  });

  it("returns correct proposal count", () => {
    contract.createProposal(
      "Count1",
      "Desc1",
      "rule-change",
      null,
      null,
      null
    );
    contract.createProposal(
      "Count2",
      "Desc2",
      "zone-update",
      null,
      null,
      null
    );
    const result = contract.getProposalCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks proposal existence correctly", () => {
    contract.createProposal(
      "Exists",
      "Desc",
      "rule-change",
      null,
      null,
      null
    );
    const result = contract.checkProposalExistence("Exists");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.checkProposalExistence("NonExists");
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("rejects proposal with invalid type", () => {
    const result = contract.createProposal(
      "InvalidType",
      "Desc",
      "invalid",
      null,
      null,
      null
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PROPOSAL_TYPE);
  });

  it("rejects proposal with empty title", () => {
    const result = contract.createProposal(
      "",
      "Desc",
      "rule-change",
      null,
      null,
      null
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DESCRIPTION);
  });

  it("rejects max proposals exceeded", () => {
    contract.state.maxProposals = 1;
    contract.createProposal(
      "Max1",
      "Desc1",
      "rule-change",
      null,
      null,
      null
    );
    const result = contract.createProposal(
      "Max2",
      "Desc2",
      "rule-change",
      null,
      null,
      null
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_PROPOSALS_EXCEEDED);
  });
});