<?php

declare(strict_types=1);

namespace Bga\Games\BorealisArticExpeditions;

use Bga\GameFramework\Components\Deck;
use Bga\Games\BorealisArticExpeditions\States\Gameplay;

class Game extends \Bga\GameFramework\Table
{
    public const GLOBAL_SCIENTISTS = 'scientists';

    public const GLOBAL_FLAGS = 'flags';

    public const GLOBAL_OBJECTIVES = 'objectives';

    public const GLOBAL_SCORING_CARDS = 'scoring_cards';

    public const GLOBAL_ROUND_LEADER = 'round_leader_id';

    public const GLOBAL_MULLIGAN = 'mulligan_used';

    public Deck $animals;

    public function __construct()
    {
        parent::__construct();
        $this->animals = $this->bga->deckFactory->createDeck('card');
    }

    public function getGameProgression(): int
    {
        $max = 0;
        $table = $this->getNextPlayerTable();
        foreach ($table as $pid => $_) {
            if ($pid === 0 || $pid === '0') {
                continue;
            }
            $pid = (int) $pid;
            $max = max($max, BoardModel::maxStackDepth($this->animals, $pid));
        }
        if ($max >= 7) {
            return 99;
        }

        return min(95, 10 + $max * 12);
    }

    protected function getAllDatas(int $currentPlayerId): array
    {
        $result = [];
        $result['players'] = $this->getCollectionFromDb(
            'SELECT `player_id` AS `id`, `player_score` AS `score` FROM `player`'
        );
        $result['scientists'] = $this->getScientists();
        $result['flags'] = $this->getFlags();
        $result['pool'] = $this->getPoolCards();
        $result['deck_count'] = (int) $this->animals->countCardsInLocation('deck');
        $result['discard_count'] = (int) $this->animals->countCardsInLocation('discard');
        $result['boards'] = $this->getPublicBoards();
        $result['hands'] = [];
        foreach ($this->getNextPlayerTable() as $pid) {
            if ($pid === 0) {
                continue;
            }
            $pid = (int) $pid;
            if ($pid === $currentPlayerId) {
                $result['hands'][$pid] = $this->getHandCardsFor($pid);
            } else {
                $result['hands'][$pid] = (int) $this->animals->countCardsInLocation('hand', $pid);
            }
        }
        $result['objectives'] = $this->getObjectivesState();
        $result['scoring_cards'] = $this->getScoringCardIds();
        $result['track'] = [
            'vpPerSpace' => Material::TRACK_SPACE_VP,
            'vehiclesPerLocation' => Material::TRACK_SIDE_A_VEHICLES,
        ];

        return $result;
    }

    /**
     * @return array<int, array<int, list<int>>>
     */
    public function getScientists(): array
    {
        $v = $this->bga->globals->get(self::GLOBAL_SCIENTISTS, []);

        return is_array($v) ? $v : [];
    }

    /**
     * @param array<int, array<int, list<int>>> $data
     */
    public function setScientists(array $data): void
    {
        $this->bga->globals->set(self::GLOBAL_SCIENTISTS, $data);
    }

    /**
     * @return array<int, array<int, int>>
     */
    public function getFlags(): array
    {
        $v = $this->bga->globals->get(self::GLOBAL_FLAGS, []);

        return is_array($v) ? $v : [];
    }

    /**
     * @param array<int, array<int, int>> $data
     */
    public function setFlags(array $data): void
    {
        $this->bga->globals->set(self::GLOBAL_FLAGS, $data);
    }

    /**
     * @return list<array{id:int, active:bool, players:array<int, string>}>
     */
    public function getObjectivesState(): array
    {
        $v = $this->bga->globals->get(self::GLOBAL_OBJECTIVES, []);

        return is_array($v) ? $v : [];
    }

    /**
     * @param list<array{id:int, active:bool, players:array<int, string>}> $o
     */
    public function setObjectivesState(array $o): void
    {
        $this->bga->globals->set(self::GLOBAL_OBJECTIVES, $o);
    }

    /**
     * @return list<int>
     */
    public function getScoringCardIds(): array
    {
        $v = $this->bga->globals->get(self::GLOBAL_SCORING_CARDS, []);

        return is_array($v) ? $v : [];
    }

    /**
     * @param list<int> $ids
     */
    public function setScoringCardIds(array $ids): void
    {
        $this->bga->globals->set(self::GLOBAL_SCORING_CARDS, $ids);
    }

    public function getRoundLeaderId(): int
    {
        return (int) $this->bga->globals->get(self::GLOBAL_ROUND_LEADER, 0);
    }

    public function setRoundLeaderId(int $id): void
    {
        $this->bga->globals->set(self::GLOBAL_ROUND_LEADER, $id);
    }

    /**
     * @return array<int, bool>
     */
    public function getMulliganUsed(): array
    {
        $v = $this->bga->globals->get(self::GLOBAL_MULLIGAN, []);

        return is_array($v) ? $v : [];
    }

    /**
     * @param array<int, bool> $m
     */
    public function setMulliganUsed(array $m): void
    {
        $this->bga->globals->set(self::GLOBAL_MULLIGAN, $m);
    }

    /**
     * Normalize a DB row from the Deck into a stable shape for the client (ids + decoded animal fields).
     *
     * @param array<string, mixed> $c
     * @return array{id:int, species:int, vehicle:int, bonus_vp:int}
     */
    public static function enrichAnimalCardRow(array $c): array
    {
        $def = Material::decodeAnimalCard($c);

        return [
            'id' => (int) ($c['id'] ?? $c['card_id'] ?? 0),
            'species' => $def['species'],
            'vehicle' => $def['vehicle'],
            'bonus_vp' => $def['bonus_vp'],
        ];
    }

    /**
     * @return list<array{id:int, species:int, vehicle:int, bonus_vp:int}>
     */
    public function getHandCardsFor(int $playerId): array
    {
        $cards = $this->animals->getCardsInLocation('hand', $playerId, 'card_location_arg');
        $out = [];
        foreach ($cards as $c) {
            $out[] = self::enrichAnimalCardRow($c);
        }

        return $out;
    }

    /**
     * @return list<array{slot:int, id:int, species:int, vehicle:int}>
     */
    public function getPoolCards(): array
    {
        $cards = $this->animals->getCardsInLocation('pool', null, 'card_location_arg');
        $out = [];
        foreach ($cards as $c) {
            $row = self::enrichAnimalCardRow($c);
            $out[] = [
                'slot' => (int) ($c['location_arg'] ?? $c['card_location_arg'] ?? 0),
                'id' => $row['id'],
                'species' => $row['species'],
                'vehicle' => $row['vehicle'],
            ];
        }
        usort($out, fn ($a, $b) => $a['slot'] <=> $b['slot']);

        return $out;
    }

    /**
     * @return array<int, list<list<array{id:int, species:int, vehicle:int, bonus_vp:int>>>>
     */
    public function getPublicBoards(): array
    {
        $boards = [];
        foreach ($this->getNextPlayerTable() as $pid) {
            if ($pid === 0) {
                continue;
            }
            $pid = (int) $pid;
            $boards[$pid] = [[], [], []];
            for ($loc = 0; $loc < Material::LOCATION_COUNT; $loc++) {
                $locStr = BoardModel::boardLocationStr($pid, $loc);
                $cards = $this->animals->getCardsInLocation($locStr, null, 'card_location_arg');
                foreach ($cards as $c) {
                    $boards[$pid][$loc][] = self::enrichAnimalCardRow($c);
                }
            }
        }

        return $boards;
    }

    public function drawFromAnimalDeckFor(int $playerId): array
    {
        if ((int) $this->animals->countCardsInLocation('deck') === 0) {
            $this->animals->moveAllCardsInLocation('discard', 'deck');
            $this->animals->shuffle('deck');
        }
        $card = $this->animals->getCardOnTop('deck');
        if ($card === null) {
            throw new \Bga\GameFramework\UserException(clienttranslate('The animal deck is empty'));
        }
        $this->animals->pickCard('deck', $playerId);

        return $card;
    }

    public function drawFromAnimalDeckToLocation(string $location, int $locationArg = 0): array
    {
        if ((int) $this->animals->countCardsInLocation('deck') === 0) {
            $this->animals->moveAllCardsInLocation('discard', 'deck');
            $this->animals->shuffle('deck');
        }
        $card = $this->animals->pickCardForLocation('deck', $location, $locationArg);
        if ($card === null) {
            throw new \Bga\GameFramework\UserException(clienttranslate('The animal deck is empty'));
        }

        return $card;
    }

    public function updateObjectiveConditions(): void
    {
        $objectives = $this->getObjectivesState();
        $boards = $this->getPublicBoards();
        $flags = $this->getFlags();
        $pids = [];
        foreach ($this->getNextPlayerTable() as $pid) {
            if ($pid !== 0) {
                $pids[] = (int) $pid;
            }
        }
        foreach ($objectives as $oi => $obj) {
            if (! $obj['active']) {
                continue;
            }
            foreach ($pids as $pid) {
                $status = $obj['players'][$pid] ?? 'unmet';
                if ($status === 'claimed') {
                    continue;
                }
                $meets = $this->evalObjectiveMeets((int) $obj['id'], $pid, $boards, $flags);
                if ($meets) {
                    $objectives[$oi]['players'][$pid] = 'meets';
                } else {
                    if ($status === 'meets') {
                        $objectives[$oi]['players'][$pid] = 'unmet';
                    }
                }
            }
        }
        $this->setObjectivesState($objectives);
    }

    /**
     * @param array<int, list<list<array{id:int, species:int, vehicle:int, bonus_vp:int>>>> $boards
     * @param array<int, array<int, int>> $flags
     */
    public function evalObjectiveMeets(int $objectiveId, int $playerId, array $boards, array $flags): bool
    {
        return match ($objectiveId) {
            Material::OBJ_ANIMAL_SAMPLE => $this->countSpeciesOnBoard($boards, $playerId, 0) >= 2,
            Material::OBJ_SCIENTIST_SAMPLE => $this->maxScientistsOneLocation($playerId) >= 5,
            Material::OBJ_VEHICLE_SAMPLE => $this->maxFlag($flags, $playerId) >= 2,
            default => false,
        };
    }

    /**
     * @param array<int, list<list<array{id:int, species:int, vehicle:int, bonus_vp:int>>>> $boards
     */
    private function countSpeciesOnBoard(array $boards, int $playerId, int $species): int
    {
        $n = 0;
        foreach ($boards[$playerId] ?? [] as $pile) {
            foreach ($pile as $c) {
                if ((int) $c['species'] === $species) {
                    $n++;
                }
            }
        }

        return $n;
    }

    private function maxScientistsOneLocation(int $playerId): int
    {
        $sci = $this->getScientists();
        $best = 0;
        for ($loc = 0; $loc < Material::LOCATION_COUNT; $loc++) {
            $t = 0;
            for ($c = 0; $c < Material::SCIENTIST_COLORS; $c++) {
                $t += BoardModel::colorCountAtLocation($sci, $playerId, $loc, $c);
            }
            $best = max($best, $t);
        }

        return $best;
    }

    /**
     * @param array<int, array<int, int>> $flags
     */
    private function maxFlag(array $flags, int $playerId): int
    {
        $m = 0;
        foreach ($flags[$playerId] ?? [] as $v) {
            $m = max($m, (int) $v);
        }

        return $m;
    }

    /**
     * @param list<array{id:int, active:bool, players:array<int, string>}> $objectives
     */
    public function claimObjective(int $activePlayerId, int $objectiveIndex): void
    {
        $objectives = $this->getObjectivesState();
        if (! isset($objectives[$objectiveIndex])) {
            throw new \Bga\GameFramework\UserException(clienttranslate('Invalid objective'));
        }
        $obj = $objectives[$objectiveIndex];
        if (! $obj['active']) {
            throw new \Bga\GameFramework\UserException(clienttranslate('This objective is no longer active'));
        }
        $st = $obj['players'][$activePlayerId] ?? 'unmet';
        if ($st !== 'meets') {
            throw new \Bga\GameFramework\UserException(clienttranslate('You cannot claim this objective yet'));
        }
        foreach ($this->getNextPlayerTable() as $pid) {
            if ($pid === 0) {
                continue;
            }
            $pid = (int) $pid;
            $ps = $objectives[$objectiveIndex]['players'][$pid] ?? 'unmet';
            if ($ps === 'meets') {
                $objectives[$objectiveIndex]['players'][$pid] = 'claimed';
                $this->bga->playerScore->inc($pid, 5, null);
            }
        }
        $this->setObjectivesState($objectives);
        $oid = (int) $objectives[$objectiveIndex]['id'];
        $this->bga->notify->all(
            'objectiveClaimed',
            clienttranslate('Players claimed an objective'),
            [
                'objective_index' => $objectiveIndex,
                'objective_id' => $oid,
            ]
        );
    }

    public function deactivateClaimedObjectives(): void
    {
        $objectives = $this->getObjectivesState();
        foreach ($objectives as $i => $obj) {
            $any = false;
            foreach ($obj['players'] as $st) {
                if ($st === 'claimed') {
                    $any = true;
                    break;
                }
            }
            if ($any) {
                $objectives[$i]['active'] = false;
            }
        }
        $this->setObjectivesState($objectives);
    }

    public function anyLocationHasSevenPlusCards(): bool
    {
        foreach ($this->getNextPlayerTable() as $pid) {
            if ($pid === 0) {
                continue;
            }
            if (BoardModel::maxStackDepth($this->animals, (int) $pid) >= 7) {
                return true;
            }
        }

        return false;
    }

    public function applyEndScoring(): void
    {
        $boards = $this->getPublicBoards();
        $flags = $this->getFlags();
        $sci = $this->getScientists();
        $scoringIds = $this->getScoringCardIds();
        foreach ($this->getNextPlayerTable() as $pid) {
            if ($pid === 0) {
                continue;
            }
            $pid = (int) $pid;
            $add = 0;
            for ($loc = 0; $loc < Material::LOCATION_COUNT; $loc++) {
                $add += $this->scoreSpeciesSets($boards[$pid][$loc] ?? []);
            }
            for ($loc = 0; $loc < Material::LOCATION_COUNT; $loc++) {
                $fi = (int) ($flags[$pid][$loc] ?? 0);
                $add += Material::TRACK_SPACE_VP[$fi] ?? 0;
            }
            foreach ($boards[$pid] ?? [] as $pile) {
                foreach ($pile as $c) {
                    $add += (int) $c['bonus_vp'];
                }
            }
            foreach ($scoringIds as $sid) {
                $add += $this->scoreEndCard($sid, $pid, $boards, $flags, $sci);
            }
            if ($add > 0) {
                $this->bga->playerScore->inc($pid, $add, null);
            }
        }
    }

    /**
     * @param list<array{id:int, species:int, vehicle:int, bonus_vp:int}> $pile
     */
    private function scoreSpeciesSets(array $pile): int
    {
        $by = array_fill(0, Material::SPECIES_COUNT, 0);
        foreach ($pile as $c) {
            $by[(int) $c['species']]++;
        }
        $vp = 0;
        foreach ($by as $cnt) {
            if ($cnt > 0) {
                $vp += Material::SPECIES_SET_VP[min($cnt, count(Material::SPECIES_SET_VP) - 1)] ?? 0;
            }
        }

        return $vp;
    }

    /**
     * @param array<int, list<list<array{id:int, species:int, vehicle:int, bonus_vp:int>>>> $boards
     * @param array<int, array<int, int>> $flags
     * @param array<int, array<int, list<int>>> $sci
     */
    private function scoreEndCard(int $scoringId, int $playerId, array $boards, array $flags, array $sci): int
    {
        return match ($scoringId) {
            Material::SCORE_INTERSPECIES => $this->scoreInterspecies($boards[$playerId] ?? []),
            Material::SCORE_SAFE_RETURN => BoardModel::countScientistsInCamps($sci, $playerId) * 3,
            Material::SCORE_OUTER_LANDS => $this->scoreOuterLands($boards[$playerId] ?? []),
            default => 0,
        };
    }

    /**
     * @param list<list<array{id:int, species:int, vehicle:int, bonus_vp:int>>> $playerBoard
     */
    private function scoreInterspecies(array $playerBoard): int
    {
        $vp = 0;
        foreach ($playerBoard as $pile) {
            $sp = [];
            foreach ($pile as $c) {
                $sp[(int) $c['species']] = true;
            }
            if (count($sp) === 2) {
                $vp += 3;
            }
        }

        return $vp;
    }

    /**
     * @param list<list<array{id:int, species:int, vehicle:int, bonus_vp:int>>> $playerBoard
     */
    private function scoreOuterLands(array $playerBoard): int
    {
        $counts = [
            count($playerBoard[0] ?? []),
            count($playerBoard[1] ?? []),
            count($playerBoard[2] ?? []),
        ];
        $mid = $counts[1];
        $vp = 0;
        foreach ([0, 2] as $i) {
            if ($counts[$i] > $mid) {
                $vp += 7;
            }
        }

        return $vp;
    }

    protected function setupNewGame($players, $options = [])
    {
        $playerIds = array_map('intval', array_keys($players));
        $this->bga->playerScore->initDb($playerIds, 0);

        $gameinfos = $this->getGameinfos();
        $default_colors = $gameinfos['player_colors'];
        $query_values = [];
        foreach ($players as $player_id => $player) {
            $query_values[] = vsprintf('(%s, \'%s\', \'%s\')', [
                $player_id,
                array_shift($default_colors),
                addslashes($player['player_name']),
            ]);
        }
        static::DbQuery(
            sprintf(
                'INSERT INTO `player` (`player_id`, `player_color`, `player_name`) VALUES %s',
                implode(',', $query_values)
            )
        );
        $this->reattributeColorsBasedOnPreferences($players, $gameinfos['player_colors']);
        $this->reloadPlayersBasicInfos();

        $cards = [];
        for ($i = 0; $i < 100; $i++) {
            $cards[] = ['type' => 'animal', 'type_arg' => $i, 'nbr' => 1];
        }
        $this->animals->createCards($cards, 'deck');
        $this->animals->shuffle('deck');

        for ($slot = 0; $slot < 4; $slot++) {
            $this->animals->pickCardForLocation('deck', 'pool', $slot);
        }
        foreach ($playerIds as $pid) {
            $this->animals->pickCards(4, 'deck', $pid);
        }

        $this->setScientists(BoardModel::initialScientists($playerIds));
        $this->setFlags(BoardModel::initialFlags($playerIds));

        $objPick = [];
        $animalPool = [Material::OBJ_ANIMAL_SAMPLE];
        $sciPool = [Material::OBJ_SCIENTIST_SAMPLE];
        $vehPool = [Material::OBJ_VEHICLE_SAMPLE];
        shuffle($animalPool);
        shuffle($sciPool);
        shuffle($vehPool);
        foreach ([$animalPool[0], $sciPool[0], $vehPool[0]] as $oid) {
            $playersSt = [];
            foreach ($playerIds as $pid) {
                $playersSt[$pid] = 'unmet';
            }
            $objPick[] = ['id' => $oid, 'active' => true, 'players' => $playersSt];
        }
        $this->setObjectivesState($objPick);

        $scorePool = Material::allScoringCardIds();
        shuffle($scorePool);
        $this->setScoringCardIds([(int) $scorePool[0], (int) $scorePool[1]]);

        $mull = [];
        foreach ($playerIds as $pid) {
            $mull[$pid] = false;
        }
        $this->setMulliganUsed($mull);

        $this->activeNextPlayer();
        $order = $this->getNextPlayerTable();
        $this->setRoundLeaderId((int) $order[0]);
        $this->updateObjectiveConditions();

        return Gameplay::class;
    }

    public function upgradeTableDb($from_version)
    {
    }

    public function debug_goToState(int $state = 3)
    {
        $this->gamestate->jumpToState($state);
    }

    public function debug_playOneMove()
    {
        $this->bga->debug->playUntil(fn (int $count) => $count == 1);
    }
}
