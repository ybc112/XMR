// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MultiSigWallet is ReentrancyGuard {
    struct Transaction {
        address destination;
        uint256 value;
        bytes data;
        bool executed;
        uint256 confirmations;
    }

    mapping(address => bool) public isOwner;
    address[] public owners;
    uint256 public required;
    uint256 public transactionCount;

    mapping(uint256 => Transaction) public transactions;
    mapping(uint256 => mapping(address => bool)) public confirmations;

    event Submission(uint256 indexed txId);
    event Confirmation(address indexed sender, uint256 indexed txId);
    event Revocation(address indexed sender, uint256 indexed txId);
    event Execution(uint256 indexed txId);
    event ExecutionFailure(uint256 indexed txId);
    event Deposit(address indexed sender, uint256 value);
    event OwnerAddition(address indexed owner);
    event OwnerRemoval(address indexed owner);
    event RequirementChange(uint256 required);

    modifier onlyWallet() {
        require(msg.sender == address(this), "MultiSig: caller is not wallet");
        _;
    }

    modifier ownerDoesNotExist(address owner) {
        require(!isOwner[owner], "MultiSig: owner exists");
        _;
    }

    modifier ownerExists(address owner) {
        require(isOwner[owner], "MultiSig: owner not exists");
        _;
    }

    modifier transactionExists(uint256 txId) {
        require(transactions[txId].destination != address(0), "MultiSig: tx not exists");
        _;
    }

    modifier confirmed(uint256 txId, address owner) {
        require(confirmations[txId][owner], "MultiSig: tx not confirmed");
        _;
    }

    modifier notConfirmed(uint256 txId, address owner) {
        require(!confirmations[txId][owner], "MultiSig: tx already confirmed");
        _;
    }

    modifier notExecuted(uint256 txId) {
        require(!transactions[txId].executed, "MultiSig: tx already executed");
        _;
    }

    constructor(address[] memory _owners, uint256 _required) {
        require(_owners.length > 0, "MultiSig: owners required");
        require(_required > 0 && _required <= _owners.length, "MultiSig: invalid required");
        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            require(owner != address(0), "MultiSig: zero address");
            require(!isOwner[owner], "MultiSig: duplicate owner");
            isOwner[owner] = true;
            owners.push(owner);
        }
        required = _required;
    }

    receive() external payable {
        emit Deposit(msg.sender, msg.value);
    }

    function submitTransaction(address destination, uint256 value, bytes memory data)
        external
        returns (uint256 txId)
    {
        txId = transactionCount;
        transactions[txId] = Transaction({
            destination: destination,
            value: value,
            data: data,
            executed: false,
            confirmations: 0
        });
        transactionCount += 1;
        emit Submission(txId);
        confirmTransaction(txId);
    }

    function confirmTransaction(uint256 txId)
        public
        ownerExists(msg.sender)
        transactionExists(txId)
        notConfirmed(txId, msg.sender)
    {
        confirmations[txId][msg.sender] = true;
        transactions[txId].confirmations += 1;
        emit Confirmation(msg.sender, txId);
        if (transactions[txId].confirmations >= required && !transactions[txId].executed) {
            executeTransaction(txId);
        }
    }

    function revokeConfirmation(uint256 txId)
        external
        ownerExists(msg.sender)
        confirmed(txId, msg.sender)
        notExecuted(txId)
    {
        confirmations[txId][msg.sender] = false;
        transactions[txId].confirmations -= 1;
        emit Revocation(msg.sender, txId);
    }

    function executeTransaction(uint256 txId)
        public
        ownerExists(msg.sender)
        confirmed(txId, msg.sender)
        notExecuted(txId)
        nonReentrant
    {
        require(transactions[txId].confirmations >= required, "MultiSig: not enough confirmations");
        Transaction storage txn = transactions[txId];
        txn.executed = true;
        (bool success, ) = txn.destination.call{value: txn.value}(txn.data);
        if (success) {
            emit Execution(txId);
        } else {
            emit ExecutionFailure(txId);
            txn.executed = false;
        }
    }

    function addOwner(address owner)
        external
        onlyWallet
        ownerDoesNotExist(owner)
    {
        isOwner[owner] = true;
        owners.push(owner);
        emit OwnerAddition(owner);
    }

    function removeOwner(address owner) external onlyWallet ownerExists(owner) {
        isOwner[owner] = false;
        for (uint256 i = 0; i < owners.length - 1; i++) {
            if (owners[i] == owner) {
                owners[i] = owners[owners.length - 1];
                break;
            }
        }
        owners.pop();
        if (required > owners.length) {
            changeRequirement(owners.length);
        }
        emit OwnerRemoval(owner);
    }

    function changeRequirement(uint256 _required) public onlyWallet {
        require(_required > 0 && _required <= owners.length, "MultiSig: invalid required");
        required = _required;
        emit RequirementChange(_required);
    }

    function getOwners() external view returns (address[] memory) {
        return owners;
    }

    function getTransactionCount(bool pending, bool executed)
        external
        view
        returns (uint256 count)
    {
        for (uint256 i = 0; i < transactionCount; i++) {
            if (pending && !transactions[i].executed) count += 1;
            if (executed && transactions[i].executed) count += 1;
        }
    }

    function isConfirmed(uint256 txId) public view returns (bool) {
        return transactions[txId].confirmations >= required;
    }

    function getTransaction(uint256 txId)
        external
        view
        returns (address destination, uint256 value, bytes memory data, bool executed, uint256 numConfirmations)
    {
        Transaction storage txn = transactions[txId];
        return (txn.destination, txn.value, txn.data, txn.executed, txn.confirmations);
    }
}
