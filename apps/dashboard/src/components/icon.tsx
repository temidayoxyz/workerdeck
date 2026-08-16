import archive from '@iconify-icons/solar/archive-linear';
import arrowRight from '@iconify-icons/solar/arrow-right-linear';
import bell from '@iconify-icons/solar/bell-linear';
import box from '@iconify-icons/solar/box-linear';
import branchingPaths from '@iconify-icons/solar/branching-paths-down-linear';
import chart from '@iconify-icons/solar/chart-2-linear';
import checkCircle from '@iconify-icons/solar/check-circle-linear';
import chevronDown from '@iconify-icons/solar/alt-arrow-down-linear';
import cloud from '@iconify-icons/solar/cloud-linear';
import code from '@iconify-icons/solar/code-2-linear';
import copy from '@iconify-icons/solar/copy-linear';
import codeCircle from '@iconify-icons/solar/code-circle-linear';
import command from '@iconify-icons/solar/command-linear';
import dangerCircle from '@iconify-icons/solar/danger-circle-linear';
import dangerTriangle from '@iconify-icons/solar/danger-triangle-linear';
import database from '@iconify-icons/solar/database-linear';
import externalLink from '@iconify-icons/solar/square-arrow-right-up-linear';
import global from '@iconify-icons/solar/global-linear';
import graph from '@iconify-icons/solar/graph-up-linear';
import hamburgerMenu from '@iconify-icons/solar/hamburger-menu-linear';
import history from '@iconify-icons/solar/history-linear';
import key from '@iconify-icons/solar/key-linear';
import letter from '@iconify-icons/solar/letter-linear';
import lock from '@iconify-icons/solar/lock-keyhole-linear';
import magic from '@iconify-icons/solar/magic-stick-3-linear';
import magnifer from '@iconify-icons/solar/magnifer-linear';
import menuDots from '@iconify-icons/solar/menu-dots-linear';
import moon from '@iconify-icons/solar/moon-linear';
import network from '@iconify-icons/solar/shield-network-linear';
import plus from '@iconify-icons/solar/add-circle-linear';
import programming from '@iconify-icons/solar/programming-linear';
import pulse from '@iconify-icons/solar/pulse-2-linear';
import questionCircle from '@iconify-icons/solar/question-circle-linear';
import refresh from '@iconify-icons/solar/refresh-linear';
import restart from '@iconify-icons/solar/restart-linear';
import rocket from '@iconify-icons/solar/rocket-2-linear';
import server from '@iconify-icons/solar/server-square-linear';
import serverCloud from '@iconify-icons/solar/server-square-cloud-linear';
import serverUpdate from '@iconify-icons/solar/server-square-update-linear';
import settings from '@iconify-icons/solar/settings-linear';
import shield from '@iconify-icons/solar/shield-check-linear';
import sun from '@iconify-icons/solar/sun-2-linear';
import trash from '@iconify-icons/solar/trash-bin-trash-linear';
import usersGroup from '@iconify-icons/solar/users-group-rounded-linear';
import widgetFour from '@iconify-icons/solar/widget-4-linear';
import widgetFive from '@iconify-icons/solar/widget-5-linear';
import close from '@iconify-icons/solar/close-circle-linear';
import github from '@iconify-icons/simple-icons/github';
import gitlab from '@iconify-icons/simple-icons/gitlab';
import { Icon, type IconifyIcon, type IconProps } from '@iconify/react';

export type DashboardIconProps = Omit<IconProps, 'icon' | 'height' | 'width'> & {
  size?: number | string;
  /** Accepted for compatibility while all dashboard icons use one consistent visual weight. */
  strokeWidth?: number;
};

function createIcon(icon: IconifyIcon) {
  return function DashboardIcon({
    size = 18,
    strokeWidth: _strokeWidth,
    ...props
  }: DashboardIconProps) {
    return <Icon icon={icon} width={size} height={size} aria-hidden="true" {...props} />;
  };
}

export const Activity = createIcon(pulse);
export const AlertCircle = createIcon(dangerCircle);
export const AlertTriangle = createIcon(dangerTriangle);
export const Archive = createIcon(archive);
export const ArrowRight = createIcon(arrowRight);
export const Bell = createIcon(bell);
export const Box = createIcon(box);
export const Boxes = createIcon(widgetFive);
export const ChartNoAxesColumnIncreasing = createIcon(chart);
export const Check = createIcon(checkCircle);
export const CheckCircle2 = createIcon(checkCircle);
export const ChevronDown = createIcon(chevronDown);
export const CircleHelp = createIcon(questionCircle);
export const Cloud = createIcon(cloud);
export const CloudCog = createIcon(serverCloud);
export const Code2 = createIcon(code);
export const Command = createIcon(command);
export const Copy = createIcon(copy);
export const Database = createIcon(database);
export const DatabaseBackup = createIcon(database);
export const ExternalLink = createIcon(externalLink);
export const Menu = createIcon(hamburgerMenu);
export const Gauge = createIcon(graph);
export const Github = createIcon(github);
export const Gitlab = createIcon(gitlab);
export const GitBranch = createIcon(branchingPaths);
export const GitCommitHorizontal = createIcon(codeCircle);
export const Globe2 = createIcon(global);
export const HardDrive = createIcon(server);
export const KeyRound = createIcon(key);
export const LayoutGrid = createIcon(widgetFour);
export const LoaderCircle = createIcon(restart);
export const LockKeyhole = createIcon(lock);
export const Mail = createIcon(letter);
export const MenuDots = createIcon(menuDots);
export const Moon = createIcon(moon);
export const MoreHorizontal = createIcon(menuDots);
export const Network = createIcon(network);
export const Plus = createIcon(plus);
export const RefreshCw = createIcon(refresh);
export const Rocket = createIcon(rocket);
export const RotateCcw = createIcon(restart);
export const Search = createIcon(magnifer);
export const ServerCog = createIcon(serverUpdate);
export const Settings = createIcon(settings);
export const ShieldCheck = createIcon(shield);
export const Sparkles = createIcon(magic);
export const Sun = createIcon(sun);
export const TimerReset = createIcon(history);
export const Trash2 = createIcon(trash);
export const Users = createIcon(usersGroup);
export const Workflow = createIcon(programming);
export const X = createIcon(close);
