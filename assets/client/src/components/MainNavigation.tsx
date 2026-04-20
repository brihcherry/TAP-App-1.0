import { useNavigate } from "react-router-dom";
import { SemossBlueLogo } from "@/assets";

export const MainNavigation = () => {
	const navigate = useNavigate();

	return (
		<div className="bg-white border-b border-gray-200 h-14 px-4 shrink-0">
			<div className="flex items-center h-full">
				<button
					className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
					onClick={() => navigate("/")}
					type="button"
				>
					<img
						src={SemossBlueLogo}
						alt="SEMOSS"
						className="h-10"
					/>
					<span className="text-lg font-bold text-gray-900 whitespace-nowrap">
						System Inspector
					</span>
				</button>
			</div>
		</div>
	);
};
