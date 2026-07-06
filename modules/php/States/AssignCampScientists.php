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

class AssignCampScientists extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct(
            $game,
            id: 12,
            type: StateType::ACTIVE_PLAYER,
            name: 'assignCamp',
            description: clienttranslate('Waiting for ${actplayer}'),
            descriptionMyTurn: clienttranslate('${you}: choose a location for scientists from your camps'),
        );
    }

    public function getArgs(): array
    {
        return ['locationCount' => Material::LOCATION_COUNT];
    }

    /**
     * @throws UserException
     */
    #[PossibleAction]
    public function actAssignScientists(
        #[IntParam(min: 0, max: 2)] int $location,
        int $activePlayerId,
        array $args,
    ) {
        $g = $this->game;

        $sci = BoardModel::moveAllCampScientistsToLocation($g->getScientists(), $activePlayerId, $location);
        $g->setScientists($sci);
        $g->updateObjectiveConditions();

        foreach ($g->getNextPlayerTable() as $pid => $_) {
            if ($pid === 0) continue;
            $this->bga->notify->player(
                (int)$pid,
                'assignScientists',
                clienttranslate('${player_name} assigns scientists from camps'),
                [
                    'player_id' => $activePlayerId,
                    'player_name' => $g->getPlayerNameById($activePlayerId),
                    'location' => $location,
                    'boardState' => $g->getBoardState((int)$pid),
                ]
            );
        }

        return NextPlayer::class;
    }

    #[PossibleAction]
    public function actClaimObjective(
        #[IntParam(min: 0, max: 2)] int $objective_index,
        int $activePlayerId,
        array $args,
    ) {
        $this->game->claimObjective($activePlayerId, $objective_index);

        if ($this->game->hasPendingObjectivePrompts()) {
            return $this->game->enterPromptClaimObjectiveFrom(Game::PROMPT_RETURN_ASSIGN_CAMP);
        }

        return null;
    }

    public function zombie(int $playerId)
    {
        return $this->actAssignScientists(0, $playerId, $this->getArgs());
    }
}
