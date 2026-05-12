<?php

declare(strict_types=1);

namespace Bga\Games\BorealisArticExpeditions\States;

use Bga\GameFramework\Actions\Types\IntParam;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\BorealisArticExpeditions\Game;

class ReplenishAnimalCard extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct(
            $game,
            id: 11,
            type: StateType::ACTIVE_PLAYER,
            name: 'replenishAnimal',
            description: clienttranslate('Waiting for ${actplayer}'),
            descriptionMyTurn: clienttranslate('${you}: take a card from the pool or draw from the deck'),
        );
    }

    public function getArgs(): array
    {
        $pid = (int) $this->game->getActivePlayerId();
        $mull = $this->game->getMulliganUsed();
        $canMulligan = ($this->bga->playerScore->get($pid) >= 1) && empty($mull[$pid]);

        return [
            'pool' => $this->game->getPoolCards(),
            'canMulligan' => $canMulligan,
        ];
    }

    /**
     * @throws UserException
     */
    #[PossibleAction]
    public function actTakeAnimal(
        #[IntParam(min: -1, max: 3)] int $pool_slot,
        int $activePlayerId,
        array $args,
    ) {
        $g = $this->game;
        if ($pool_slot === -1) {
            $g->drawFromAnimalDeck();
            $this->bga->notify->all(
                'takeAnimal',
                clienttranslate('${player_name} draws from the deck'),
                [
                    'player_id' => $activePlayerId,
                    'player_name' => $g->getPlayerNameById($activePlayerId),
                    'from_deck' => true,
                ]
            );
        } else {
            $pool = $g->animals->getCardsInLocation('pool', $pool_slot);
            if (count($pool) === 0) {
                throw new UserException(clienttranslate('That pool slot is empty'));
            }
            $card = array_values($pool)[0];
            $g->animals->moveCard((int) $card['id'], 'hand', $activePlayerId);
            $g->drawFromAnimalDeckToLocation('pool', $pool_slot);
            $this->bga->notify->all(
                'takeAnimal',
                clienttranslate('${player_name} takes a card from the pool'),
                [
                    'player_id' => $activePlayerId,
                    'player_name' => $g->getPlayerNameById($activePlayerId),
                    'from_deck' => false,
                    'pool_slot' => $pool_slot,
                ]
            );
        }
        $g->updateObjectiveConditions();

        return NextPlayer::class;
    }

    #[PossibleAction]
    public function actMulliganPool(int $activePlayerId, array $args)
    {
        $g = $this->game;
        $pid = $activePlayerId;
        if ($this->bga->playerScore->get($pid) < 1) {
            throw new UserException(clienttranslate('You need at least 1 VP to mulligan the pool'));
        }
        $mull = $g->getMulliganUsed();
        if (! empty($mull[$pid])) {
            throw new UserException(clienttranslate('You can only mulligan the pool once per game'));
        }
        $this->bga->playerScore->inc($pid, -1, null);
        $g->animals->moveAllCardsInLocation('pool', 'discard');
        for ($slot = 0; $slot < 4; $slot++) {
            $g->drawFromAnimalDeckToLocation('pool', $slot);
        }
        $mull[$pid] = true;
        $g->setMulliganUsed($mull);
        $this->bga->notify->all(
            'mulliganPool',
            clienttranslate('${player_name} pays 1 VP to refresh the pool'),
            [
                'player_id' => $pid,
                'player_name' => $g->getPlayerNameById($pid),
            ]
        );

        return ReplenishAnimalCard::class;
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
        return $this->actTakeAnimal(-1, $playerId, $this->getArgs());
    }
}
