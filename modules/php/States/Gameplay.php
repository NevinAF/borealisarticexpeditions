<?php

declare(strict_types=1);

namespace Bga\Games\BorealisArticExpeditions\States;

use Bga\GameFramework\Actions\Types\IntParam;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\BorealisArticExpeditions\BoardModel;
use Bga\Games\BorealisArticExpeditions\Game;
use Bga\Games\BorealisArticExpeditions\Material;

class Gameplay extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct(
            $game,
            id: 10,
            type: StateType::ACTIVE_PLAYER,
            name: 'gameplay',
            description: clienttranslate('Waiting for ${actplayer}'),
            descriptionMyTurn: clienttranslate('${you} must observe an animal or regroup'),
        );
    }

    public function getArgs(): array
    {
        return [
            'locationCount' => Material::LOCATION_COUNT,
        ];
    }

    /**
     * @throws UserException
     */
    #[PossibleAction]
    public function actObserveAnimal(
        #[IntParam(min: 0)] int $card_id,
        #[IntParam(min: 0, max: 2)] int $location,
        int $activePlayerId,
        array $args,
    ) {
        $g = $this->game;
        $hand = $g->animals->getCardsInLocation('hand', $activePlayerId);
        $found = null;
        foreach ($hand as $c) {
            if ((int) ($c['id'] ?? $c['card_id'] ?? 0) === $card_id) {
                $found = $c;
                break;
            }
        }
        if ($found === null) {
            throw new UserException(clienttranslate('That card is not in your hand'));
        }
        $sci = $g->getScientists();
        if (! BoardModel::hasAllColorsAtLocation($sci, $activePlayerId, $location)) {
            throw new UserException(clienttranslate('You need all three scientist colors at this location'));
        }
        $def = Material::decodeAnimalCard($found);
        $sci = BoardModel::applyObserveMoves($sci, $activePlayerId, $location, $def['moves']);
        $flags = $g->getFlags();
        $fi = (int) ($flags[$activePlayerId][$location] ?? 0);
        if ($fi < 7) {
            $next = $fi + 1;
            $vehiclesOnSpace = Material::TRACK_SIDE_A_VEHICLES[$location][$next] ?? [];
            if (in_array((int) $def['vehicle'], $vehiclesOnSpace, true)) {
                $flags[$activePlayerId][$location] = $fi + 1;
            }
        }
        $g->setScientists($sci);
        $g->setFlags($flags);

        $locStr = BoardModel::boardLocationStr($activePlayerId, $location);
        $z = (int) $g->animals->countCardsInLocation($locStr);
        $cid = (int) ($found['id'] ?? $found['card_id'] ?? 0);
        if ($cid <= 0) {
            throw new UserException(clienttranslate('Invalid card'));
        }
        $g->animals->moveCard($cid, $locStr, $z);

        $g->updateObjectiveConditions();

        $this->bga->notify->all(
            'observeAnimal',
            clienttranslate('${player_name} observes an animal'),
            [
                'player_id' => $activePlayerId,
                'player_name' => $g->getPlayerNameById($activePlayerId),
                'card_id' => $card_id,
                'location' => $location,
            ]
        );

        return ReplenishAnimalCard::class;
    }

    /**
     * Regroup: discard selected hand cards, draw replacements, gain VP from camps, then assign scientists.
     * Empty discard is allowed. Card list is sent as JSON because some clients omit empty JSON arrays for array params.
     *
     * @throws UserException
     */
    #[PossibleAction]
    public function actRegroup(string $card_ids_json, int $activePlayerId, array $args): mixed
    {
        $g = $this->game;
        $decoded = json_decode($card_ids_json, true);
        if (! is_array($decoded)) {
            $decoded = json_decode(stripslashes($card_ids_json), true);
        }
        $ids = is_array($decoded) ? array_map('intval', $decoded) : [];
        if (count($ids) !== count(array_unique($ids))) {
            throw new UserException(clienttranslate('Duplicate cards in regroup selection'));
        }
        foreach ($ids as $cid) {
            $c = $g->animals->getCard($cid);
            if ($c === null) {
                throw new UserException(clienttranslate('Invalid card for regroup'));
            }
            $loc = $c['location'] ?? $c['card_location'] ?? '';
            $locArg = (int) ($c['location_arg'] ?? $c['card_location_arg'] ?? 0);
            if ($loc !== 'hand' || $locArg !== $activePlayerId) {
                throw new UserException(clienttranslate('Invalid card for regroup'));
            }
        }
        foreach ($ids as $cid) {
            $g->animals->moveCard($cid, 'discard', 0);
        }
        foreach ($ids as $_) {
            $g->drawFromAnimalDeckFor($activePlayerId);
        }
        $camp = BoardModel::countScientistsInCamps($g->getScientists(), $activePlayerId);
        if ($camp > 0) {
            $this->bga->playerScore->inc($activePlayerId, $camp, null);
        }
        $this->bga->notify->all(
            'regroup',
            clienttranslate('${player_name} regroups'),
            [
                'player_id' => $activePlayerId,
                'player_name' => $g->getPlayerNameById($activePlayerId),
                'discarded' => $ids,
                'vp_from_camps' => $camp,
            ]
        );

        return AssignCampScientists::class;
    }

    #[PossibleAction]
    public function actClaimObjective(
        #[IntParam(min: 0, max: 2)] int $objective_index,
        int $activePlayerId,
        array $args,
    ) {
        $this->game->claimObjective($activePlayerId, $objective_index);

        return null;
    }

    public function zombie(int $playerId)
    {
        return $this->actRegroup('[]', $playerId, $this->getArgs());
    }
}
