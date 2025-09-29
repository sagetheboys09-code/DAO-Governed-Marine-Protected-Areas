(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-PROPOSAL-ALREADY-EXISTS u101)
(define-constant ERR-PROPOSAL-NOT-FOUND u102)
(define-constant ERR-VOTING_CLOSED u103)
(define-constant ERR-ALREADY-VOTED u104)
(define-constant ERR_QUORUM-NOT-REACHED u105)
(define-constant ERR-INVALID-PROPOSAL-DURATION u106)
(define-constant ERR-INVALID-QUORUM-THRESHOLD u107)
(define-constant ERR-INVALID-PROPOSAL-TYPE u108)
(define-constant ERR-INVALID-DESCRIPTION u109)
(define-constant ERR-INVALID-VOTE u110)
(define-constant ERR-NOT-TOKEN-HOLDER u111)
(define-constant ERR-INSUFFICIENT-BALANCE u112)
(define-constant ERR-PROPOSAL-EXECUTED u113)
(define-constant ERR-AUTHORITY-NOT-SET u114)
(define-constant ERR-INVALID-TIMESTAMP u115)
(define-constant ERR-MAX-PROPOSALS-EXCEEDED u116)
(define-constant ERR-INVALID-RULE-CHANGE u117)
(define-constant ERR-INVALID-REWARD-AMOUNT u118)
(define-constant ERR-INVALID-ZONE u119)
(define-constant ERR-INVALID-STATUS u120)

(define-data-var next-proposal-id uint u0)
(define-data-var max-proposals uint u1000)
(define-data-var proposal-duration uint u144)
(define-data-var quorum-threshold uint u51)
(define-data-var governance-token-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var executor-contract (optional principal) none)

(define-map proposals
  uint
  {
    title: (string-utf8 100),
    description: (string-utf8 500),
    proposer: principal,
    start-height: uint,
    end-height: uint,
    proposal-type: (string-ascii 20),
    rule-change: (optional (string-utf8 200)),
    reward-amount: (optional uint),
    zone: (optional (string-ascii 50)),
    yes-votes: uint,
    no-votes: uint,
    executed: bool,
    status: (string-ascii 20)
  }
)

(define-map votes
  { proposal-id: uint, voter: principal }
  bool
)

(define-map proposal-by-title
  (string-utf8 100)
  uint
)

(define-read-only (get-proposal (id uint))
  (map-get? proposals id)
)

(define-read-only (get-vote (id uint) (voter principal))
  (map-get? votes { proposal-id: id, voter: voter })
)

(define-read-only (has-voted (id uint) (voter principal))
  (is-some (get-vote id voter))
)

(define-read-only (is-proposal-active (id uint))
  (match (get-proposal id)
    p (and (not (get executed p)) (<= block-height (get end-height p)))
    false
  )
)

(define-private (validate-title (title (string-utf8 100)))
  (if (and (> (len title) u0) (<= (len title) u100))
    (ok true)
    (err ERR-INVALID-DESCRIPTION)
  )
)

(define-private (validate-description (desc (string-utf8 500)))
  (if (and (> (len desc) u0) (<= (len desc) u500))
    (ok true)
    (err ERR-INVALID-DESCRIPTION)
  )
)

(define-private (validate-proposal-type (ptype (string-ascii 20)))
  (if (or (is-eq ptype "rule-change") (is-eq ptype "reward-dist") (is-eq ptype "zone-update"))
    (ok true)
    (err ERR-INVALID-PROPOSAL-TYPE)
  )
)

(define-private (validate-rule-change (change (optional (string-utf8 200))))
  (match change
    c (if (<= (len c) u200) (ok true) (err ERR-INVALID-RULE-CHANGE))
    (ok true)
  )
)

(define-private (validate-reward-amount (amount (optional uint)))
  (match amount
    a (if (> a u0) (ok true) (err ERR-INVALID-REWARD-AMOUNT))
    (ok true)
  )
)

(define-private (validate-zone (z (optional (string-ascii 50))))
  (match z
    zone (if (<= (len zone) u50) (ok true) (err ERR-INVALID-ZONE))
    (ok true)
  )
)

(define-private (validate-duration (dur uint))
  (if (and (> dur u0) (<= dur u10080))
    (ok true)
    (err ERR-INVALID-PROPOSAL-DURATION)
  )
)

(define-private (validate-quorum (q uint))
  (if (and (>= q u1) (<= q u100))
    (ok true)
    (err ERR-INVALID-QUORUM-THRESHOLD)
  )
)

(define-private (validate-vote (vote bool))
  (ok true)
)

(define-private (is-token-holder (who principal))
  (let ((balance (unwrap-panic (contract-call? .governance-token get-balance who))))
    (if (> balance u0) (ok true) (err ERR-NOT-TOKEN-HOLDER))
  )
)

(define-public (set-executor-contract (contract principal))
  (begin
    (asserts! (is-eq tx-sender contract-caller) (err ERR-NOT-AUTHORIZED))
    (var-set executor-contract (some contract))
    (ok true)
  )
)

(define-public (set-proposal-duration (new-dur uint))
  (begin
    (asserts! (is-eq tx-sender contract-caller) (err ERR-NOT-AUTHORIZED))
    (try! (validate-duration new-dur))
    (var-set proposal-duration new-dur)
    (ok true)
  )
)

(define-public (set-quorum-threshold (new-q uint))
  (begin
    (asserts! (is-eq tx-sender contract-caller) (err ERR-NOT-AUTHORIZED))
    (try! (validate-quorum new-q))
    (var-set quorum-threshold new-q)
    (ok true)
  )
)

(define-public (create-proposal
  (title (string-utf8 100))
  (description (string-utf8 500))
  (ptype (string-ascii 20))
  (rule-change (optional (string-utf8 200)))
  (reward-amount (optional uint))
  (zone (optional (string-ascii 50)))
)
  (let (
    (next-id (var-get next-proposal-id))
    (start block-height)
    (end (+ start (var-get proposal-duration)))
  )
    (asserts! (< next-id (var-get max-proposals)) (err ERR-MAX-PROPOSALS-EXCEEDED))
    (try! (is-token-holder tx-sender))
    (try! (validate-title title))
    (try! (validate-description description))
    (try! (validate-proposal-type ptype))
    (try! (validate-rule-change rule-change))
    (try! (validate-reward-amount reward-amount))
    (try! (validate-zone zone))
    (asserts! (is-none (map-get? proposal-by-title title)) (err ERR-PROPOSAL-ALREADY-EXISTS))
    (map-set proposals next-id
      {
        title: title,
        description: description,
        proposer: tx-sender,
        start-height: start,
        end-height: end,
        proposal-type: ptype,
        rule-change: rule-change,
        reward-amount: reward-amount,
        zone: zone,
        yes-votes: u0,
        no-votes: u0,
        executed: false,
        status: "active"
      }
    )
    (map-set proposal-by-title title next-id)
    (var-set next-proposal-id (+ next-id u1))
    (print { event: "proposal-created", id: next-id, title: title })
    (ok next-id)
  )
)

(define-public (vote-on-proposal (id uint) (vote bool))
  (let ((prop (unwrap! (get-proposal id) (err ERR-PROPOSAL-NOT-FOUND))))
    (asserts! (is-proposal-active id) (err ERR-VOTING_CLOSED))
    (asserts! (not (has-voted id tx-sender)) (err ERR-ALREADY-VOTED))
    (try! (is-token-holder tx-sender))
    (let ((balance (unwrap-panic (contract-call? .governance-token get-balance tx-sender))))
      (asserts! (> balance u0) (err ERR-INSUFFICIENT-BALANCE))
      (map-set votes { proposal-id: id, voter: tx-sender } vote)
      (if vote
        (map-set proposals id (merge prop { yes-votes: (+ (get yes-votes prop) balance) }))
        (map-set proposals id (merge prop { no-votes: (+ (get no-votes prop) balance) }))
      )
      (print { event: "vote-cast", id: id, voter: tx-sender, vote: vote, weight: balance })
      (ok true)
    )
  )
)

(define-public (execute-proposal (id uint))
  (let ((prop (unwrap! (get-proposal id) (err ERR-PROPOSAL-NOT-FOUND))))
    (asserts! (> block-height (get end-height prop)) (err ERR-VOTING_CLOSED))
    (asserts! (not (get executed prop)) (err ERR-PROPOSAL-EXECUTED))
    (let (
      (total-votes (+ (get yes-votes prop) (get no-votes prop)))
      (quorum (* total-votes (var-get quorum-threshold)))
    )
      (asserts! (>= (get yes-votes prop) quorum) (err ERR-QUORUM-NOT-REACHED))
      (map-set proposals id (merge prop { executed: true, status: "executed" }))
      (match (var-get executor-contract)
        exec (try! (contract-call? exec execute id prop))
        (err ERR-AUTHORITY-NOT-SET)
      )
      (print { event: "proposal-executed", id: id })
      (ok true)
    )
  )
)

(define-read-only (get-proposal-count)
  (ok (var-get next-proposal-id))
)

(define-read-only (check-proposal-existence (title (string-utf8 100)))
  (ok (is-some (map-get? proposal-by-title title)))
)